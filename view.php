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
 * Course activity player view controller for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');
require_once(__DIR__ . '/lib.php');

$id = optional_param('id', 0, PARAM_INT); // Course Module ID.
$s  = optional_param('s', 0, PARAM_INT);  // smartvideo instance ID.

if ($id) {
    $cm = get_coursemodule_from_id('smartvideo', $id, 0, false, MUST_EXIST);
    $course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
    $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);
} else if ($s) {
    $smartvideo = $DB->get_record('smartvideo', ['id' => $s], '*', MUST_EXIST);
    $course = $DB->get_record('course', ['id' => $smartvideo->course], '*', MUST_EXIST);
    $cm = get_coursemodule_from_instance('smartvideo', $smartvideo->id, $course->id, false, MUST_EXIST);
} else {
    throw new moodle_exception('invalidcoursemodule');
}

require_login($course, true, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/smartvideo:view', $context);

// Trigger course_module_viewed event.
$event = \mod_smartvideo\event\course_module_viewed::create([
    'context'  => $context,
    'objectid' => $smartvideo->id,
]);
$event->add_record_snapshot('course_modules', $cm);
$event->add_record_snapshot('course', $course);
$event->add_record_snapshot('smartvideo', $smartvideo);
$event->trigger();

// Completion view tracking.
$completion = new \completion_info($course);
$completion->set_module_viewed($cm);

$pageurl = new moodle_url('/mod/smartvideo/view.php', ['id' => $cm->id]);
$PAGE->set_url($pageurl);
$PAGE->set_title($smartvideo->name);
$PAGE->set_heading($course->fullname);
$PAGE->set_context($context);
$PAGE->set_activity_record($smartvideo);

$canmanage = has_capability('moodle/course:manageactivities', $context)
    || has_capability('mod/smartvideo:addinstance', $context)
    || has_capability('mod/smartvideo:managequestions', $context);

// Allow teachers/admins to reset their own attempts for testing.
if ($canmanage && optional_param('resetmyattempts', 0, PARAM_INT) && confirm_sesskey()) {
    $DB->delete_records('smartvideo_qattempts', [
        'instanceid' => $smartvideo->id,
        'userid'     => $USER->id,
    ]);
    $DB->delete_records('smartvideo_progress', [
        'instanceid' => $smartvideo->id,
        'userid'     => $USER->id,
    ]);
    redirect(new moodle_url('/mod/smartvideo/view.php', ['id' => $cm->id]));
}

// Fetch linked media record from central library.
$media = null;
if (!empty($smartvideo->mediaid)) {
    $media = $DB->get_record('local_securevideolibrary_media', ['id' => $smartvideo->mediaid]);
}

echo $OUTPUT->header();

$intro = format_module_intro('smartvideo', $smartvideo, $cm->id);
if (!empty($intro)) {
    echo $intro;
}

if (!$media || $media->status !== 'ready') {
    if ($media && ($media->status === 'queued' || $media->status === 'processing')) {
        echo $OUTPUT->notification(get_string('videonotready', 'mod_smartvideo'), 'info');
    } else {
        echo $OUTPUT->notification(get_string('novideowarning', 'mod_smartvideo'), 'warning');
    }
} else {
    // Fetch user progress.
    $progress = $DB->get_record('smartvideo_progress', [
        'instanceid' => $smartvideo->id,
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
    $questions = $DB->get_records('smartvideo_questions', ['instanceid' => $smartvideo->id], 'timecode ASC');
    $questionsdata = [];
    $firstunpassedtime = null;

    foreach ($questions as $q) {
        $passed = $DB->record_exists('smartvideo_qattempts', [
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
            'title'          => !empty($q->title) ? format_string($q->title) : get_string('knowledgecheck', 'mod_smartvideo'),
            'requirecorrect' => (int)$q->requirecorrect,
            'rewindonfail'   => (int)($q->rewindonfail ?? 0),
            'rewindto'       => $rewindto,
            'questionstyle'  => !empty($q->questionstyle) ? $q->questionstyle : 'compact',
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

    // Fetch configured chapters.
    $chapters = $DB->get_records('smartvideo_chapters', ['instanceid' => $smartvideo->id], 'timecode ASC');
    $chaptersdata = [];
    $chapindex = 1;
    foreach ($chapters as $ch) {
        $cmins = floor($ch->timecode / 60);
        $csecs = $ch->timecode % 60;
        $chtimeformatted = sprintf('%02d:%02d', $cmins, $csecs);
        $chpercent = ($media->duration > 0) ? min(100, round(($ch->timecode / $media->duration) * 100, 2)) : 0;

        $chaptersdata[] = [
            'id'            => (int)$ch->id,
            'index'         => $chapindex++,
            'timecode'      => (int)$ch->timecode,
            'timeformatted' => $chtimeformatted,
            'percent'       => $chpercent,
            'title'         => format_string($ch->title),
        ];
    }

    // Fetch configured in-video callouts.
    $callouts = $DB->get_records('smartvideo_callouts', ['instanceid' => $smartvideo->id], 'timecode ASC');
    $calloutsdata = [];
    foreach ($callouts as $c) {
        $cmins = floor($c->timecode / 60);
        $csecs = $c->timecode % 60;
        $ctimeformatted = sprintf('%02d:%02d', $cmins, $csecs);
        $cpercent = ($media->duration > 0) ? min(100, round(($c->timecode / $media->duration) * 100, 2)) : 0;

        $calloutsdata[] = [
            'id'            => (int)$c->id,
            'timecode'      => (int)$c->timecode,
            'timeformatted' => $ctimeformatted,
            'percent'       => $cpercent,
            'duration'      => (int)$c->duration,
            'title'         => format_string($c->title),
            'body'          => format_text($c->body, FORMAT_HTML),
            'linkurl'       => !empty($c->linkurl) ? $c->linkurl : '',
            'linklabel'     => !empty($c->linklabel) ? format_string($c->linklabel) : '',
            'haslink'       => !empty($c->linkurl),
            'autopause'     => !empty($c->autopause),
            'position'      => !empty($c->position) ? $c->position : 'bottom-right',
        ];
    }

    // Fetch student personal notes.
    $notes = $DB->get_records('smartvideo_notes', [
        'instanceid' => $smartvideo->id,
        'userid'     => $USER->id,
    ], 'timecode ASC');
    $notesdata = [];
    foreach ($notes as $note) {
        $nm = floor($note->timecode / 60);
        $ns = $note->timecode % 60;
        $notesdata[] = [
            'id'            => (int)$note->id,
            'timecode'      => (int)$note->timecode,
            'timeformatted' => sprintf('%02d:%02d', $nm, $ns),
            'content'       => format_text($note->content, FORMAT_PLAIN),
            'rawcontent'    => $note->content,
            'timemodified'  => (int)$note->timemodified,
        ];
    }

    // Fetch student structured case report.
    $report = $DB->get_record('smartvideo_reports', [
        'instanceid' => $smartvideo->id,
        'userid'     => $USER->id,
    ]);
    $reportdata = [
        'id'              => $report ? (int)$report->id : 0,
        'hasreport'       => !empty($report),
        'findings'        => $report ? $report->findings : '',
        'impression'      => $report ? $report->impression : '',
        'diagnosis'       => $report ? $report->diagnosis : '',
        'recommendations' => $report ? $report->recommendations : '',
        'status'          => $report ? $report->status : 'draft',
        'issubmitted'     => ($report && $report->status === 'submitted'),
    ];

    // Fetch subtitles and parse cues for captions & interactive transcript.
    $subtitles = $DB->get_records('smartvideo_subtitles', ['instanceid' => $smartvideo->id], 'id ASC');
    $tracksdata = [];
    $primarycues = [];
    $primarytrack = null;
    foreach ($subtitles as $sub) {
        $tracksdata[] = [
            'id'    => (int)$sub->id,
            'lang'  => $sub->lang,
            'label' => $sub->label,
        ];
        if ($primarytrack === null) {
            $primarytrack = $sub;
        }
    }
    if ($primarytrack) {
        $primarycues = \mod_smartvideo\vtt_helper::parse_vtt($primarytrack->content);
    }
    if (empty($tracksdata) && $media) {
        $libraryvtt = \local_securevideolibrary\storage::get_file_path($media->id, 'subtitles.vtt');
        if ($libraryvtt && file_exists($libraryvtt)) {
            $content = file_get_contents($libraryvtt);
            if ($content) {
                $primarycues = \mod_smartvideo\vtt_helper::parse_vtt($content);
                $tracksdata[] = [
                    'id'    => 0,
                    'lang'  => 'en',
                    'label' => 'English',
                ];
            }
        }
    }

    // Fetch lecture resources and handouts from filearea.
    $fs = get_file_storage();
    $rawfiles = $fs->get_area_files($context->id, 'mod_smartvideo', 'resources', 0, 'sortorder, itemid, filename', false);
    $resourcesdata = [];
    foreach ($rawfiles as $file) {
        if ($file->is_directory()) {
            continue;
        }
        $fileurl = moodle_url::make_pluginfile_url(
            $context->id,
            'mod_smartvideo',
            'resources',
            0,
            $file->get_filepath(),
            $file->get_filename(),
            true
        )->out(false);

        $fext = strtolower(pathinfo($file->get_filename(), PATHINFO_EXTENSION));
        $ficon = 'fa-file-o';
        if ($fext === 'pdf') {
            $ficon = 'fa-file-pdf-o text-danger';
        } else if (in_array($fext, ['ppt', 'pptx'])) {
            $ficon = 'fa-file-powerpoint-o text-warning';
        } else if (in_array($fext, ['doc', 'docx'])) {
            $ficon = 'fa-file-word-o text-primary';
        } else if (in_array($fext, ['xls', 'xlsx', 'csv'])) {
            $ficon = 'fa-file-excel-o text-success';
        } else if (in_array($fext, ['zip', 'rar', 'tar', 'gz'])) {
            $ficon = 'fa-file-archive-o text-secondary';
        } else if (in_array($fext, ['png', 'jpg', 'jpeg', 'webp'])) {
            $ficon = 'fa-file-image-o text-info';
        }

        $resourcesdata[] = [
            'filename' => $file->get_filename(),
            'filesize' => display_size($file->get_filesize()),
            'fileurl'  => $fileurl,
            'icon'     => $ficon,
        ];
    }

    // Fetch timestamped Q&A discussions.
    $discrecords = $DB->get_records('smartvideo_discussions', ['instanceid' => $smartvideo->id], 'timecreated ASC');
    $discusers = [];
    if (!empty($discrecords)) {
        $userids = array_unique(array_filter(array_map(function($disc) {
            return (int)$disc->userid;
        }, $discrecords)));

        if (!empty($userids)) {
            if (class_exists('\core_user\fields')) {
                $required = \core_user\fields::for_userpic()->get_required_fields();
                $fieldlist = implode(', ', $required);
            } else {
                $fieldlist = '*';
            }
            $discusers = $DB->get_records_list('user', 'id', $userids, '', $fieldlist);
        }
    }

    $topdiscussions = [];
    $repliesmap = [];
    foreach ($discrecords as $disc) {
        $u = $discusers[$disc->userid] ?? null;
        $dm = floor($disc->timecode / 60);
        $ds = $disc->timecode % 60;
        $dformatted = ($disc->timecode > 0) ? sprintf('%02d:%02d', $dm, $ds) : '';

        $discitem = [
            'id'                   => (int)$disc->id,
            'userid'               => (int)$disc->userid,
            'userfullname'         => $u ? fullname($u) : 'User',
            'userpicture'          => $u ? $OUTPUT->user_picture($u, ['size' => 28]) : '',
            'timecode'             => (int)$disc->timecode,
            'timeformatted'        => $dformatted,
            'hastimecode'          => ($disc->timecode > 0),
            'content'              => format_text($disc->content, FORMAT_PLAIN),
            'parentid'             => (int)$disc->parentid,
            'timecreatedformatted' => userdate($disc->timecreated, get_string('strftimedatetimeshort', 'langconfig')),
            'candelete'            => ($disc->userid == $USER->id || $canmanage),
            'replies'              => [],
        ];

        if ($disc->parentid > 0) {
            $repliesmap[$disc->parentid][] = $discitem;
        } else {
            $topdiscussions[$disc->id] = $discitem;
        }
    }
    $discussionsdata = [];
    foreach ($topdiscussions as $did => $dtop) {
        if (isset($repliesmap[$did])) {
            $dtop['replies'] = $repliesmap[$did];
            $dtop['hasreplies'] = true;
            $dtop['replycount'] = count($repliesmap[$did]);
        } else {
            $dtop['hasreplies'] = false;
            $dtop['replycount'] = 0;
        }
        $discussionsdata[] = $dtop;
    }

    $playerdata = [
        'cmid'                 => (int)$cm->id,
        'title'                => $smartvideo->name,
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
        'completionminpercent' => (int)$smartvideo->completionminpercent,
        'hascompletionrule'    => (!empty($smartvideo->completionminpercent)),
        'preventseeking'       => !empty($smartvideo->preventseeking),
        'watermarkenabled'     => !empty($smartvideo->watermarkenabled),
        'watermarkopacity'     => (float)($smartvideo->watermarkopacity / 100),
        'studentname'          => fullname($USER),
        'studentid'            => (int)$USER->id,
        'studentip'            => getremoteaddr(),
        'livetime'             => userdate(time(), get_string('strftimedatetimeshort', 'langconfig')),
        'questions'            => $questionsdata,
        'hasquestions'         => !empty($questionsdata),
        'questionsjson'        => s(json_encode($questionsdata)),
        'chapters'             => $chaptersdata,
        'haschapters'          => !empty($chaptersdata),
        'chaptersjson'         => s(json_encode($chaptersdata)),
        'callouts'             => $calloutsdata,
        'hascallouts'          => !empty($calloutsdata),
        'calloutsjson'         => s(json_encode($calloutsdata)),
        'notes'                => $notesdata,
        'hasnotes'             => !empty($notesdata),
        'notecount'            => count($notesdata),
        'notesjson'            => s(json_encode($notesdata)),
        'report'               => $reportdata,
        'subtitles'            => $tracksdata,
        'hassubtitles'         => !empty($tracksdata),
        'subtitlecues'         => $primarycues,
        'hascues'              => !empty($primarycues),
        'cuesjson'             => s(json_encode($primarycues)),
        'tracksjson'           => s(json_encode($tracksdata)),
        'resources'            => $resourcesdata,
        'hasresources'         => !empty($resourcesdata),
        'resourcecount'        => count($resourcesdata),
        'discussions'          => $discussionsdata,
        'hasdiscussions'       => !empty($discussionsdata),
        'discussioncount'      => count($discussionsdata),
        'canmanage'            => $canmanage,
        'managequestionsurl'   => (new moodle_url('/mod/smartvideo/questions.php', ['id' => $cm->id]))->out(false),
        'resetattemptsurl'     => (new moodle_url('/mod/smartvideo/view.php', [
            'id'              => $cm->id,
            'resetmyattempts' => 1,
            'sesskey'         => sesskey(),
        ]))->out(false),
    ];

    echo $OUTPUT->render_from_template('mod_smartvideo/player', $playerdata);
}

echo $OUTPUT->footer();
