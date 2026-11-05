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
    'userid, watchedseconds, percentcompleted, lastposition, watchedintervals, timemodified'
);

// Fetch student case reports indexed by userid.
$reportrecords = $DB->get_records(
    'smartvideo_reports',
    ['instanceid' => $instance->id],
    '',
    'userid, id, status, findings, impression, diagnosis, recommendations, timemodified'
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

    $rep = $reportrecords[$user->id] ?? null;
    $hascasereport = !empty($rep);
    $reportsubmitted = ($rep && $rep->status === 'submitted');
    $reportdraft = ($rep && $rep->status === 'draft');

    $studentsdata[] = [
        'userid'                => $user->id,
        'userfullname'          => $userfullname,
        'useremail'             => $useremail,
        'userpicture'           => $userpicture,
        'userprofileurl'        => $userprofileurl,
        'percent'               => $percent,
        'watchedformatted'      => $watchedformatted,
        'lastposformatted'      => $lastposformatted,
        'statusclass'           => $statusclass,
        'statustext'            => $statustext,
        'lastupdated'           => $lastupdated,
        'hasquestions'          => ($totalquestions > 0),
        'questionssummary'      => $questionssummary,
        'qstatusclass'          => $qstatusclass,
        'hascasereport'         => $hascasereport,
        'reportsubmitted'       => $reportsubmitted,
        'reportdraft'           => $reportdraft,
        'reportfindings'        => $rep ? s($rep->findings) : '',
        'reportimpression'      => $rep ? s($rep->impression) : '',
        'reportdiagnosis'       => $rep ? s($rep->diagnosis) : '',
        'reportrecommendations' => $rep ? s($rep->recommendations) : '',
    ];
}

$avgpercent = $totalenrolled > 0 ? (int)round($totalpercent / $totalenrolled) : 0;

// Compute audience retention & engagement heatmap curve.
$heatmapdata = [];
$svgpathline = '';
$svgpatharea = '';
$hasheatmap = false;
$heatmapchapters = [];

if ($duration > 0 && $totalenrolled > 0) {
    $numbuckets = 60;
    $bucketduration = $duration / $numbuckets;
    $bucketcounts = array_fill(0, $numbuckets, 0);

    foreach ($progressrecords as $prog) {
        $intervals = [];
        if (!empty($prog->watchedintervals)) {
            $parsed = json_decode($prog->watchedintervals, true);
            if (is_array($parsed)) {
                $intervals = $parsed;
            }
        }
        if (empty($intervals) && !empty($prog->lastposition)) {
            $intervals = [[0, (int)$prog->lastposition]];
        }

        foreach ($intervals as $iv) {
            if (!is_array($iv) || count($iv) < 2) {
                continue;
            }
            $istart = max(0, (float)$iv[0]);
            $iend = min($duration, (float)$iv[1]);
            if ($iend <= $istart) {
                continue;
            }

            for ($b = 0; $b < $numbuckets; $b++) {
                $bstart = $b * $bucketduration;
                $bend = ($b + 1) * $bucketduration;
                if ($istart < $bend && $iend > $bstart) {
                    $bucketcounts[$b]++;
                }
            }
        }
    }

    $maxcount = max(1, max($bucketcounts));
    $points = [];
    for ($b = 0; $b < $numbuckets; $b++) {
        $count = $bucketcounts[$b];
        $timeat = round($b * $bucketduration);
        $tm = floor($timeat / 60);
        $ts = $timeat % 60;
        $tformatted = sprintf('%02d:%02d', $tm, $ts);
        $percent = round(($count / $totalenrolled) * 100);

        // SVG viewBox is 0 0 1000 200. Height is 200, padding top 20, baseline Y: 180.
        $x = round(($b / ($numbuckets - 1)) * 1000, 1);
        $normalized = ($count / $maxcount);
        $y = round(180 - ($normalized * 150), 1);

        $points[] = "$x,$y";
        $heatmapdata[] = [
            'x'          => $x,
            'y'          => $y,
            'second'     => $timeat,
            'time'       => $tformatted,
            'count'      => $count,
            'percentage' => $percent,
        ];
    }

    if (!empty($points)) {
        $svgpathline = 'M ' . implode(' L ', $points);
        $svgpatharea = $svgpathline . ' L 1000,180 L 0,180 Z';
        $hasheatmap = true;
    }

    // Chapters for heatmap x-axis markers.
    $chrecords = $DB->get_records('smartvideo_chapters', ['instanceid' => $instance->id], 'timecode ASC');
    foreach ($chrecords as $ch) {
        $cpercent = ($duration > 0) ? min(100, round(($ch->timecode / $duration) * 100, 1)) : 0;
        $heatmapchapters[] = [
            'title'    => format_string($ch->title),
            'timecode' => (int)$ch->timecode,
            'percent'  => $cpercent,
            'x'        => round(($cpercent / 100) * 1000, 1),
        ];
    }
}

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
    'hasheatmap'           => $hasheatmap,
    'svgpathline'          => $svgpathline,
    'svgpatharea'          => $svgpatharea,
    'heatmapchapters'      => $heatmapchapters,
    'hasheatmapchapters'  => !empty($heatmapchapters),
    'heatmapjson'          => s(json_encode($heatmapdata)),
];

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('mod_smartvideo/report', $data);
echo $OUTPUT->footer();
