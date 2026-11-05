<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Watch Progress Report for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');
require_once(__DIR__ . '/lib.php');

$id = required_param('id', PARAM_INT);
$cm = get_coursemodule_from_id('smartvideo', $id, 0, false, MUST_EXIST);
$course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
$instance = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

require_login($course, false, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/smartvideo:viewreports', $context);

$pageurl = new moodle_url('/mod/smartvideo/report.php', ['id' => $cm->id]);
$PAGE->set_url($pageurl);
$PAGE->set_title(get_string('report', 'mod_smartvideo') . ': ' . $instance->name);
$PAGE->set_heading($course->fullname);
$PAGE->set_context($context);

// Fetch linked media record.
$media = null;
if (!empty($instance->mediaid)) {
    $media = $DB->get_record('local_securevideolibrary_media', ['id' => $instance->mediaid]);
}

$duration = $media ? (int)$media->duration : 0;
$durmins = floor($duration / 60);
$dursecs = $duration % 60;
$durationformatted = sprintf('%02d:%02d', $durmins, $dursecs);

// Enrolled users.
$users = get_enrolled_users($context, 'mod/smartvideo:view', 0, 'u.*', 'u.lastname ASC, u.firstname ASC');

// Completion info.
$minpercent = (int)($instance->completionminpercent ?? 0);
$completion = new \completion_info($course);
$completionenabled = $completion->is_enabled($cm);

// Total interactive questions configured.
$totalquestions = $DB->count_records('smartvideo_questions', ['instanceid' => $instance->id]);

// Count passed questions per user.
$passedbyuser = [];
if ($totalquestions > 0) {
    $passedrecords = $DB->get_records_sql(
        "SELECT userid, COUNT(id) AS passedcount
           FROM {smartvideo_qattempts}
          WHERE instanceid = :instanceid AND passed = 1
       GROUP BY userid",
        ['instanceid' => $instance->id]
    );
    foreach ($passedrecords as $pr) {
        $passedbyuser[$pr->userid] = (int)$pr->passedcount;
    }
}

// Watch progress records indexed by userid.
$progressrecords = $DB->get_records(
    'smartvideo_progress',
    ['instanceid' => $instance->id],
    '',
    'userid, watchedseconds, percentcompleted, lastposition, timemodified'
);

$studentsdata = [];
$totalenrolled = count($users);
$totalcompleted = 0;
$totalpercent = 0;

foreach ($users as $user) {
    $userpicture = $OUTPUT->user_picture($user, ['size' => 35]);
    $userfullname = fullname($user);
    $userprofileurl = (new moodle_url('/user/view.php', ['id' => $user->id, 'course' => $course->id]))->out(false);

    $prog = $progressrecords[$user->id] ?? null;

    if ($prog) {
        $percent = (int)$prog->percentcompleted;
        $watchedsec = (int)$prog->watchedseconds;
        $lastpossec = (int)$prog->lastposition;

        if ($completionenabled) {
            $cdata = $completion->get_data($cm, false, $user->id);
            $iscompleted = ($cdata->completionstate == COMPLETION_COMPLETE ||
                            $cdata->completionstate == COMPLETION_COMPLETE_PASS);
        } else if ($minpercent > 0) {
            $iscompleted = ($percent >= $minpercent);
        } else {
            $iscompleted = ($percent >= 100);
        }

        if ($iscompleted) {
            $totalcompleted++;
            $statusclass = 'badge bg-success';
            $statustext = get_string('completed', 'mod_smartvideo');
        } else if ($watchedsec > 0) {
            $statusclass = 'badge bg-primary';
            $statustext = get_string('in_progress', 'mod_smartvideo');
        } else {
            $statusclass = 'badge bg-secondary';
            $statustext = get_string('notstarted', 'mod_smartvideo');
        }

        $watchedformatted = sprintf('%02d:%02d', floor($watchedsec / 60), $watchedsec % 60);
        $lastposformatted = sprintf('%02d:%02d', floor($lastpossec / 60), $lastpossec % 60);
        $lastupdated = !empty($prog->timemodified) ?
            userdate($prog->timemodified, get_string('strftimedatetime', 'langconfig')) : '-';
    } else {
        $percent = 0;
        $statusclass = 'badge bg-secondary';
        $statustext = get_string('notstarted', 'mod_smartvideo');
        $watchedformatted = '00:00';
        $lastposformatted = '00:00';
        $lastupdated = '-';
    }

    $totalpercent += $percent;

    // Interactive questions summary.
    $questionssummary = '-';
    $qstatusclass = '';
    if ($totalquestions > 0) {
        $passedcount = $passedbyuser[$user->id] ?? 0;
        $qratio = round(($passedcount / $totalquestions) * 100);
        $questionssummary = $passedcount . ' / ' . $totalquestions . ' (' . $qratio . '%)';
        if ($passedcount >= $totalquestions) {
            $qstatusclass = 'badge bg-success-subtle text-success border border-success-subtle';
        } else if ($passedcount > 0) {
            $qstatusclass = 'badge bg-warning-subtle text-warning-emphasis border border-warning-subtle';
        } else {
            $qstatusclass = 'badge bg-secondary-subtle text-secondary border border-secondary-subtle';
        }
    }

    $studentsdata[] = [
        'userid'           => $user->id,
        'userfullname'     => $userfullname,
        'useremail'        => $user->email,
        'userpicture'      => $userpicture,
        'userprofileurl'   => $userprofileurl,
        'percent'          => $percent,
        'watchedformatted' => $watchedformatted,
        'lastposformatted' => $lastposformatted,
        'statusclass'      => $statusclass,
        'statustext'       => $statustext,
        'lastupdated'      => $lastupdated,
        'hasquestions'     => ($totalquestions > 0),
        'questionssummary' => $questionssummary,
        'qstatusclass'     => $qstatusclass,
    ];
}

$avgpercent = $totalenrolled > 0 ? (int)round($totalpercent / $totalenrolled) : 0;

$data = [
    'instancename'         => format_string($instance->name),
    'videotitle'           => $media ? format_string($media->title) : '',
    'durationformatted'    => $durationformatted,
    'totalenrolled'        => $totalenrolled,
    'totalcompleted'       => $totalcompleted,
    'avgpercent'           => $avgpercent,
    'hasstudents'          => !empty($studentsdata),
    'students'             => $studentsdata,
    'backurl'              => (new moodle_url('/mod/smartvideo/view.php', ['id' => $cm->id]))->out(false),
    'completionminpercent' => (int)($instance->completionminpercent ?? 0),
    'hasactivityquestions' => ($totalquestions > 0),
];

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('mod_smartvideo/report', $data);
echo $OUTPUT->footer();
