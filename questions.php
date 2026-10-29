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
 * Teacher management page for in-video interactive questions in mod_securevideo.
 *
 * @package    mod_securevideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');
require_once(__DIR__ . '/lib.php');

$id = required_param('id', PARAM_INT);
$cm = get_coursemodule_from_id('securevideo', $id, 0, false, MUST_EXIST);
$course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
$securevideo = $DB->get_record('securevideo', ['id' => $cm->instance], '*', MUST_EXIST);

require_login($course, false, $cm);
$context = context_module::instance($cm->id);

if (
    !has_capability('moodle/course:manageactivities', $context)
    && !has_capability('mod/securevideo:addinstance', $context)
) {
    throw new moodle_exception('nopermissions', 'error', '', 'manage questions');
}

$pageurl = new moodle_url('/mod/securevideo/questions.php', ['id' => $cm->id]);
$PAGE->set_url($pageurl);
$PAGE->set_title(get_string('interactivequestions', 'mod_securevideo') . ': ' . $securevideo->name);
$PAGE->set_heading($course->fullname);
$PAGE->set_context($context);

// Fetch linked media record.
$media = null;
if (!empty($securevideo->mediaid)) {
    $media = $DB->get_record('local_securevideolibrary_media', ['id' => $securevideo->mediaid]);
}

$duration = $media ? (int)$media->duration : 0;
$mins = floor($duration / 60);
$secs = $duration % 60;
$durationformatted = sprintf('%02d:%02d', $mins, $secs);

$playlisturl = '';
$thumbnailurl = '';
if ($media) {
    $playlisturl = (new moodle_url('/local/securevideolibrary/serve.php', [
        'mediaid' => $media->id,
        'file'    => 'playlist.m3u8',
    ]))->out(false);

    $thumbnailurl = (new moodle_url('/local/securevideolibrary/serve.php', [
        'mediaid' => $media->id,
        'file'    => 'thumbnail.jpg',
    ]))->out(false);
}

// Fetch configured questions.
$questions = $DB->get_records('securevideo_questions', ['instanceid' => $securevideo->id], 'timecode ASC');
$questionsdata = [];

foreach ($questions as $q) {
    $qname = '';
    $qtype = '';
    $snippet = '';

    $qid = (int)$q->questionid;
    if ($qid <= 0 && !empty($q->questionbankentryid)) {
        $qid = \mod_securevideo\question_helper::get_latest_question_id((int)$q->questionbankentryid, 0);
        if ($qid > 0) {
            $DB->set_field('securevideo_questions', 'questionid', $qid, ['id' => $q->id]);
        }
    }

    $qrecord = ($qid > 0) ? $DB->get_record('question', ['id' => $qid]) : false;
    if ($qrecord) {
        $qname = format_string($qrecord->name);
        $qtype = $qrecord->qtype;
        $plain = html_to_text(format_text($qrecord->questiontext, $qrecord->questiontextformat));
        $plain = preg_replace('/\s+/', ' ', trim($plain));
        if (mb_strlen($plain) > 100) {
            $plain = mb_substr($plain, 0, 97) . '...';
        }
        $snippet = $plain;
    }

    $qm = floor($q->timecode / 60);
    $qs = $q->timecode % 60;
    $timeformatted = sprintf('%02d:%02d', $qm, $qs);

    $rewindto = isset($q->rewindto) ? (int)$q->rewindto : -1;
    $hasrewind = ($rewindto >= 0);
    $rewindtoformatted = '';
    if ($hasrewind) {
        $rm = floor($rewindto / 60);
        $rs = $rewindto % 60;
        $rewindtoformatted = sprintf('%02d:%02d', $rm, $rs);
    }

    $percent = ($duration > 0) ? min(100, round(($q->timecode / $duration) * 100, 2)) : 0;

    $questionsdata[] = [
        'id'                  => (int)$q->id,
        'questionbankentryid' => (int)$q->questionbankentryid,
        'questionid'          => (int)$q->questionid,
        'timecode'            => (int)$q->timecode,
        'timeformatted'       => $timeformatted,
        'percent'             => $percent,
        'title'               => !empty($q->title) ? format_string($q->title) : get_string('knowledgecheck', 'mod_securevideo'),
        'questionname'        => $qname,
        'qtype'               => $qtype,
        'snippet'             => $snippet,
        'requirecorrect'      => !empty($q->requirecorrect),
        'rewindonfail'        => (int)($q->rewindonfail ?? 0),
        'rewindto'            => $rewindto,
        'rewindtoformatted'   => $rewindtoformatted,
        'hasrewind'           => $hasrewind,
    ];
}

$templatecontext = [
    'cmid'              => (int)$cm->id,
    'videoname'         => format_string($securevideo->name),
    'backtovideourl'    => (new moodle_url('/mod/securevideo/view.php', ['id' => $cm->id]))->out(false),
    'hasmedia'          => ($media && $media->status === 'ready'),
    'playlisturl'       => $playlisturl,
    'thumbnailurl'      => $thumbnailurl,
    'duration'          => $duration,
    'durationformatted' => $durationformatted,
    'questions'         => $questionsdata,
    'hasquestions'      => !empty($questionsdata),
    'questioncount'     => count($questionsdata),
    'questionsjson'     => s(json_encode($questionsdata)),
];

$PAGE->requires->js_call_amd('mod_securevideo/questions', 'init', [[
    'cmid'     => (int)$cm->id,
    'duration' => $duration,
]]);

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('mod_securevideo/questions', $templatecontext);
echo $OUTPUT->footer();
