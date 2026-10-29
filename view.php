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
 * Course activity player view controller for mod_securevideo.
 *
 * @package    mod_securevideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');
require_once(__DIR__ . '/lib.php');

$id = optional_param('id', 0, PARAM_INT); // Course Module ID.
$s  = optional_param('s', 0, PARAM_INT);  // securevideo instance ID.

if ($id) {
    $cm = get_coursemodule_from_id('securevideo', $id, 0, false, MUST_EXIST);
    $course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
    $securevideo = $DB->get_record('securevideo', ['id' => $cm->instance], '*', MUST_EXIST);
} else if ($s) {
    $securevideo = $DB->get_record('securevideo', ['id' => $s], '*', MUST_EXIST);
    $course = $DB->get_record('course', ['id' => $securevideo->course], '*', MUST_EXIST);
    $cm = get_coursemodule_from_instance('securevideo', $securevideo->id, $course->id, false, MUST_EXIST);
} else {
    throw new moodle_exception('invalidcoursemodule');
}

require_login($course, true, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/securevideo:view', $context);

// Trigger course_module_viewed event.
$event = \mod_securevideo\event\course_module_viewed::create([
    'context'  => $context,
    'objectid' => $securevideo->id,
]);
$event->add_record_snapshot('course_modules', $cm);
$event->add_record_snapshot('course', $course);
$event->add_record_snapshot('securevideo', $securevideo);
$event->trigger();

// Completion view tracking.
$completion = new \completion_info($course);
$completion->set_module_viewed($cm);

$pageurl = new moodle_url('/mod/securevideo/view.php', ['id' => $cm->id]);
$PAGE->set_url($pageurl);
$PAGE->set_title($securevideo->name);
$PAGE->set_heading($course->fullname);
$PAGE->set_context($context);
$PAGE->set_activity_record($securevideo);

$canmanage = has_capability('moodle/course:manageactivities', $context)
    || has_capability('mod/securevideo:addinstance', $context);

// Allow teachers/admins to reset their own attempts for testing.
if ($canmanage && optional_param('resetmyattempts', 0, PARAM_INT) && confirm_sesskey()) {
    $DB->delete_records('securevideo_qattempts', [
        'instanceid' => $securevideo->id,
        'userid'     => $USER->id,
    ]);
    $DB->delete_records('securevideo_progress', [
        'instanceid' => $securevideo->id,
        'userid'     => $USER->id,
    ]);
    redirect(new moodle_url('/mod/securevideo/view.php', ['id' => $cm->id]));
}

// Fetch linked media record from central library.
$media = null;
if (!empty($securevideo->mediaid)) {
    $media = $DB->get_record('local_securevideolibrary_media', ['id' => $securevideo->mediaid]);
}

echo $OUTPUT->header();

$intro = format_module_intro('securevideo', $securevideo, $cm->id);
if (!empty($intro)) {
    echo $intro;
}

if (!$media || $media->status !== 'ready') {
    if ($media && ($media->status === 'queued' || $media->status === 'processing')) {
        echo $OUTPUT->notification(get_string('videonotready', 'mod_securevideo'), 'info');
    } else {
        echo $OUTPUT->notification(get_string('novideowarning', 'mod_securevideo'), 'warning');
    }
} else {
    // Fetch user progress.
    $progress = $DB->get_record('securevideo_progress', [
        'instanceid' => $securevideo->id,
        'userid'     => $USER->id,
    ]);

    $playlisturl = (new moodle_url('/local/securevideolibrary/serve.php', [
        'mediaid' => $media->id,
        'file'    => 'playlist.m3u8',
    ]))->out(false);

    $thumbnailurl = (new moodle_url('/local/securevideolibrary/serve.php', [
        'mediaid' => $media->id,
        'file'    => 'thumbnail.jpg',
    ]))->out(false);

    $mins = floor($media->duration / 60);
    $secs = $media->duration % 60;
    $durationformatted = sprintf('%02d:%02d', $mins, $secs);

    $percentcompleted = $progress ? (int)$progress->percentcompleted : 0;

    // Fetch configured interactive questions.
    $questions = $DB->get_records('securevideo_questions', ['instanceid' => $securevideo->id], 'timecode ASC');
    $questionsdata = [];
    $firstunpassedtime = null;

    foreach ($questions as $q) {
        $passed = $DB->record_exists('securevideo_qattempts', [
            'svquestionid' => $q->id,
            'userid'       => $USER->id,
            'passed'       => 1,
        ]);

        if (!empty($q->requirecorrect) && !$passed && $firstunpassedtime === null) {
            $firstunpassedtime = (int)$q->timecode;
        }

        $qm = floor($q->timecode / 60);
        $qs = $q->timecode % 60;
        $timeformatted = sprintf('%02d:%02d', $qm, $qs);
        $percent = ($media->duration > 0) ? min(100, round(($q->timecode / $media->duration) * 100, 2)) : 0;

        $rewindto = isset($q->rewindto) ? (int)$q->rewindto : -1;
        $questionsdata[] = [
            'id'             => (int)$q->id,
            'timecode'       => (int)$q->timecode,
            'timeformatted'  => $timeformatted,
            'percent'        => $percent,
            'title'          => !empty($q->title) ? format_string($q->title) : get_string('knowledgecheck', 'mod_securevideo'),
            'requirecorrect' => (int)$q->requirecorrect,
            'rewindonfail'   => (int)($q->rewindonfail ?? 0),
            'rewindto'       => $rewindto,
            'passed'         => $passed,
        ];
    }

    $lastposition = $progress ? (int)$progress->lastposition : 0;
    $maxposition  = $progress ? (int)$progress->maxposition : 0;

    // If an unpassed required question sits before the student's saved bookmark, cap the bookmark.
    if ($firstunpassedtime !== null) {
        if ($lastposition > $firstunpassedtime) {
            $lastposition = $firstunpassedtime;
        }
        if ($maxposition > $firstunpassedtime) {
            $maxposition = $firstunpassedtime;
        }
    }

    $lastposmins = floor($lastposition / 60);
    $lastpossecs = $lastposition % 60;
    $lastposformatted = sprintf('%02d:%02d', $lastposmins, $lastpossecs);

    $playerdata = [
        'cmid'                 => (int)$cm->id,
        'title'                => $securevideo->name,
        'playlisturl'          => $playlisturl,
        'thumbnailurl'         => $thumbnailurl,
        'duration'             => (int)$media->duration,
        'durationformatted'    => $durationformatted,
        'hasresume'            => ($lastposition > 15 && $lastposition < ($media->duration - 15)),
        'lastposition'         => $lastposition,
        'lastposformatted'     => $lastposformatted,
        'maxposition'          => $maxposition,
        'watchedseconds'       => $progress ? (int)$progress->watchedseconds : 0,
        'watchedintervals'     => s($progress ? $progress->watchedintervals : '[]'),
        'percentcompleted'     => $percentcompleted,
        'completionminpercent' => (int)$securevideo->completionminpercent,
        'hascompletionrule'    => (!empty($securevideo->completionminpercent)),
        'preventseeking'       => !empty($securevideo->preventseeking),
        'watermarkenabled'     => !empty($securevideo->watermarkenabled),
        'watermarkopacity'     => (float)($securevideo->watermarkopacity / 100),
        'studentname'          => fullname($USER),
        'studentid'            => (int)$USER->id,
        'studentip'            => getremoteaddr(),
        'livetime'             => userdate(time(), get_string('strftimedatetimeshort', 'langconfig')),
        'questions'            => $questionsdata,
        'hasquestions'         => !empty($questionsdata),
        'questionsjson'        => s(json_encode($questionsdata)),
        'canmanage'            => $canmanage,
        'resetattemptsurl'     => (new moodle_url('/mod/securevideo/view.php', [
            'id'              => $cm->id,
            'resetmyattempts' => 1,
            'sesskey'         => sesskey(),
        ]))->out(false),
    ];

    echo $OUTPUT->render_from_template('mod_securevideo/player', $playerdata);
}

echo $OUTPUT->footer();
