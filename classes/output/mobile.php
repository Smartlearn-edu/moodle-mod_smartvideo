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

namespace mod_smartvideo\output;

use completion_info;
use context_module;
use core_external\util;
use moodle_url;

/**
 * Mobile output controller for mod_smartvideo (Moodle App Site Plugins).
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class mobile {
    /**
     * Renders the main course module view for the official Moodle Mobile App.
     *
     * @param array $args Arguments from CoreCourseModuleDelegate (cmid, courseid, userid).
     * @return array Mobile response containing templates, javascript, otherdata, and files.
     */
    public static function mobile_course_view(array $args): array {
        global $OUTPUT, $USER, $DB;

        $args = (object)$args;
        $cm = get_coursemodule_from_id('smartvideo', (int)$args->cmid, 0, false, MUST_EXIST);
        $course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        // Security and capability enforcement.
        require_login($course, false, $cm, true, true);
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

        // Mark viewed for completion tracking.
        $completion = new completion_info($course);
        $completion->set_module_viewed($cm);

        $canmanage = has_capability('moodle/course:manageactivities', $context)
            || has_capability('mod/smartvideo:addinstance', $context)
            || has_capability('mod/smartvideo:managequestions', $context);

        $smartvideo->name = format_string($smartvideo->name);
        [$intro, $introformat] = util::format_text(
            $smartvideo->intro,
            $smartvideo->introformat,
            $context,
            'mod_smartvideo',
            'intro'
        );

        // Determine video source and streaming readiness.
        $videosource = !empty($smartvideo->videosource) ? $smartvideo->videosource : 'securelibrary';
        $isexternal = ($videosource !== 'securelibrary');

        $media = null;
        if (!$isexternal && !empty($smartvideo->mediaid)) {
            $media = $DB->get_record('local_securevideolibrary_media', ['id' => $smartvideo->mediaid]);
        }

        $canplay = false;
        $notreadyreason = 'novideo';
        if ($isexternal) {
            if (!empty($smartvideo->videourl)) {
                $canplay = true;
            } else {
                $notreadyreason = 'invalidurl';
            }
        } else {
            if ($media && $media->status === 'ready') {
                $canplay = true;
            } else if ($media && ($media->status === 'queued' || $media->status === 'processing')) {
                $notreadyreason = 'processing';
            }
        }

        // Fetch student progress.
        $progress = $DB->get_record('smartvideo_progress', [
            'instanceid' => $smartvideo->id,
            'userid'     => $USER->id,
        ]);

        $playlisturl = '';
        $thumbnailurl = '';
        $embedurl = '';
        $isiframeprovider = false;
        $duration = 0;
        $hlsjsurl = (new moodle_url('/local/securevideolibrary/serve.php', [
            'file' => 'hls.js',
        ]))->out(false);

        if ($canplay) {
            if ($isexternal) {
                $playlisturl = $smartvideo->videourl;
                $thumbnailurl = $smartvideo->posterimage ?? '';
                $duration = (int)($smartvideo->duration ?? 0);
                [$isiframeprovider, $embedurl] = self::resolve_external_embed($videosource, $smartvideo->videourl);
            } else {
                $mstoken = \local_securevideolibrary\token_manager::generate_mobile_stream_token(
                    (int)$USER->id,
                    (int)$media->id,
                    (int)$cm->id
                );

                $playlisturl = (new moodle_url('/local/securevideolibrary/serve.php', [
                    'mediaid' => (int)$media->id,
                    'cmid'    => (int)$cm->id,
                    'file'    => 'playlist.m3u8',
                    'mstoken' => $mstoken,
                ]))->out(false);

                $thumbnailurl = (new moodle_url('/local/securevideolibrary/serve.php', [
                    'mediaid' => (int)$media->id,
                    'cmid'    => (int)$cm->id,
                    'file'    => 'thumbnail.jpg',
                    'mstoken' => $mstoken,
                ]))->out(false);

                $duration = (int)$media->duration;
            }
        }

        $mins = (int)floor($duration / 60);
        $secs = (int)($duration % 60);
        $durationformatted = sprintf('%02d:%02d', $mins, $secs);
        $percentcompleted = $progress ? (int)$progress->percentcompleted : 0;

        // Fetch interactive questions.
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

            $qm = (int)floor($q->timecode / 60);
            $qs = (int)($q->timecode % 60);
            $percent = ($duration > 0) ? min(100, round(($q->timecode / $duration) * 100, 2)) : 0;

            $questionsdata[] = [
                'id'             => (int)$q->id,
                'timecode'       => (int)$q->timecode,
                'timeformatted'  => sprintf('%02d:%02d', $qm, $qs),
                'percent'        => $percent,
                'title'          => !empty($q->title) ? format_string($q->title) : get_string('knowledgecheck', 'mod_smartvideo'),
                'requirecorrect' => (int)$q->requirecorrect,
                'rewindonfail'   => (int)($q->rewindonfail ?? 0),
                'rewindto'       => isset($q->rewindto) ? (int)$q->rewindto : -1,
                'questionstyle'  => !empty($q->questionstyle) ? $q->questionstyle : 'compact',
                'passed'         => (bool)$passed,
            ];
        }

        $lastposition = $progress ? (int)$progress->lastposition : 0;
        $maxposition  = $progress ? (int)$progress->maxposition : 0;

        if ($firstunpassedtime !== null) {
            if ($lastposition > $firstunpassedtime) {
                $lastposition = $firstunpassedtime;
            }
            if ($maxposition > $firstunpassedtime) {
                $maxposition = $firstunpassedtime;
            }
        }

        $lastposformatted = sprintf('%02d:%02d', (int)floor($lastposition / 60), (int)($lastposition % 60));

        // Fetch chapters.
        $chapters = $DB->get_records('smartvideo_chapters', ['instanceid' => $smartvideo->id], 'timecode ASC');
        $chaptersdata = [];
        $chapindex = 1;
        foreach ($chapters as $ch) {
            $cmins = (int)floor($ch->timecode / 60);
            $csecs = (int)($ch->timecode % 60);
            $chpercent = ($duration > 0) ? min(100, round(($ch->timecode / $duration) * 100, 2)) : 0;

            $chaptersdata[] = [
                'id'            => (int)$ch->id,
                'index'         => $chapindex++,
                'timecode'      => (int)$ch->timecode,
                'timeformatted' => sprintf('%02d:%02d', $cmins, $csecs),
                'percent'       => $chpercent,
                'title'         => format_string($ch->title),
            ];
        }

        // Fetch in-video callouts.
        $callouts = $DB->get_records('smartvideo_callouts', ['instanceid' => $smartvideo->id], 'timecode ASC');
        $calloutsdata = [];
        foreach ($callouts as $c) {
            $cmins = (int)floor($c->timecode / 60);
            $csecs = (int)($c->timecode % 60);
            $cpercent = ($duration > 0) ? min(100, round(($c->timecode / $duration) * 100, 2)) : 0;

            $calloutsdata[] = [
                'id'            => (int)$c->id,
                'timecode'      => (int)$c->timecode,
                'timeformatted' => sprintf('%02d:%02d', $cmins, $csecs),
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
            $nm = (int)floor($note->timecode / 60);
            $ns = (int)($note->timecode % 60);
            $notesdata[] = [
                'id'            => (int)$note->id,
                'timecode'      => (int)$note->timecode,
                'timeformatted' => sprintf('%02d:%02d', $nm, $ns),
                'content'       => format_text($note->content, FORMAT_PLAIN),
                'rawcontent'    => $note->content,
                'timemodified'  => (int)$note->timemodified,
            ];
        }

        // Fetch student structured clinical/case report.
        $report = $DB->get_record('smartvideo_reports', [
            'instanceid' => $smartvideo->id,
            'userid'     => $USER->id,
        ]);

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
        } else if ($media) {
            $libraryvtt = \local_securevideolibrary\storage::get_file_path($media->id, 'subtitles.vtt');
            if ($libraryvtt && file_exists($libraryvtt)) {
                $vttcontent = file_get_contents($libraryvtt);
                if ($vttcontent) {
                    $primarycues = \mod_smartvideo\vtt_helper::parse_vtt($vttcontent);
                    $tracksdata[] = [
                        'id'    => 0,
                        'lang'  => 'en',
                        'label' => 'English',
                    ];
                }
            }
        }

        // Fetch lecture resources & handouts for <core-file> and offline download.
        $fs = get_file_storage();
        $rawfiles = $fs->get_area_files($context->id, 'mod_smartvideo', 'resources', 0, 'sortorder, itemid, filename', false);
        $resourcesdata = [];
        $mobilefiles = [];
        foreach ($rawfiles as $file) {
            if ($file->is_directory()) {
                continue;
            }
            $fileurl = moodle_url::make_webservice_pluginfile_url(
                $context->id,
                'mod_smartvideo',
                'resources',
                0,
                $file->get_filepath(),
                $file->get_filename()
            )->out(false);

            $fileentry = [
                'filename'       => $file->get_filename(),
                'filepath'       => $file->get_filepath(),
                'filesize'       => (int)$file->get_filesize(),
                'filesizehuman'  => display_size($file->get_filesize()),
                'fileurl'        => $fileurl,
                'timemodified'   => (int)$file->get_timemodified(),
                'mimetype'       => $file->get_mimetype(),
                'isexternalfile' => (int)$file->is_external_file(),
            ];
            $resourcesdata[] = $fileentry;
            $mobilefiles[] = $fileentry;
        }

        // Fetch Q&A discussions.
        $discrecords = $DB->get_records('smartvideo_discussions', ['instanceid' => $smartvideo->id], 'timecreated ASC');
        $discusers = [];
        if (!empty($discrecords)) {
            $userids = array_unique(array_filter(array_map(function ($disc) {
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
            $dm = (int)floor($disc->timecode / 60);
            $ds = (int)($disc->timecode % 60);
            $dformatted = ($disc->timecode > 0) ? sprintf('%02d:%02d', $dm, $ds) : '';

            $discitem = [
                'id'                   => (int)$disc->id,
                'userid'               => (int)$disc->userid,
                'userfullname'         => $u ? fullname($u) : 'User',
                'timecode'             => (int)$disc->timecode,
                'timeformatted'        => $dformatted,
                'hastimecode'          => ($disc->timecode > 0),
                'content'              => format_text($disc->content, FORMAT_PLAIN),
                'parentid'             => (int)$disc->parentid,
                'timecreated'          => (int)$disc->timecreated,
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

        $canofflinedownload = (!isset($smartvideo->allowofflinedownload)
            || !empty($smartvideo->allowofflinedownload)) && !$isexternal && $canplay;

        $offlinemanifestjson = '';
        if ($canofflinedownload) {
            try {
                $manifestdata = \mod_smartvideo\external\get_offline_manifest::execute((int)$cm->id);
                if (!empty($manifestdata['status'])) {
                    $offlinemanifestjson = json_encode($manifestdata);
                }
            } catch (\Throwable $e) {
                $offlinemanifestjson = '';
            }
        }

        $templatedata = [
            'cmid'                 => (int)$cm->id,
            'courseid'             => (int)$course->id,
            'title'                => $smartvideo->name,
            'intro'                => $intro,
            'hasintro'             => !empty($intro),
            'canplay'              => $canplay,
            'isprocessing'         => ($notreadyreason === 'processing'),
            'isinvalidurl'         => ($notreadyreason === 'invalidurl'),
            'videotype'            => $videosource,
            'isiframeprovider'     => $isiframeprovider,
            'embedurl'             => $embedurl,
            'playlisturl'          => $playlisturl,
            'thumbnailurl'         => $thumbnailurl,
            'duration'             => $duration,
            'durationformatted'    => $durationformatted,
            'hasresume'            => ($lastposition > 15 && $lastposition < ($duration - 15)),
            'lastposition'         => $lastposition,
            'lastposformatted'     => $lastposformatted,
            'percentcompleted'     => $percentcompleted,
            'completionminpercent' => (int)$smartvideo->completionminpercent,
            'hascompletionrule'    => !empty($smartvideo->completionminpercent),
            'watermarkenabled'     => !empty($smartvideo->watermarkenabled),
            'watermarkopacity'     => (float)($smartvideo->watermarkopacity / 100),
            'studentname'          => fullname($USER),
            'studentid'            => (int)$USER->id,
            'resources'            => $resourcesdata,
            'hasresources'         => !empty($resourcesdata),
            'allowofflinedownload' => $canofflinedownload ? 1 : 0,
        ];

        // All values in otherdata MUST be scalars or JSON-encoded strings.
        $otherdata = [
            'cmid'                  => (int)$cm->id,
            'courseid'              => (int)$course->id,
            'activetab'             => 'overview',
            'videotype'             => $videosource,
            'isiframeprovider'      => $isiframeprovider ? 1 : 0,
            'playlisturl'           => $playlisturl,
            'embedurl'              => $embedurl,
            'hlsjsurl'              => $hlsjsurl,
            'allowofflinedownload'  => $canofflinedownload ? 1 : 0,
            'offlinemanifestjson'   => $offlinemanifestjson,
            'isofflinemode'         => 0,
            'offlinedownloaded'     => 0,
            'isdownloading'         => 0,
            'downloadpercent'       => 0,
            'downloadtransferred'   => '',
            'downloadtotal'         => '',
            'offlinesizehuman'      => '',
            'offlinequality'        => '',
            'duration'              => $duration,
            'durationformatted'     => $durationformatted,
            'currenttime'           => 0,
            'currenttimeformatted'  => '00:00',
            'progresspercent'       => 0,
            'maxpercent'            => ($duration > 0) ? min(100, round(($maxposition / $duration) * 100, 2)) : 0,
            'isplaying'             => 0,
            'ismuted'               => 0,
            'playbackrate'          => '1',
            'captionsenabled'       => !empty($primarycues) ? 1 : 0,
            'activecaption'         => '',
            'showresumetoast'       => ($lastposition > 15 && $lastposition < ($duration - 15)) ? 1 : 0,
            'lastposition'          => $lastposition,
            'lastposformatted'      => $lastposformatted,
            'maxposition'           => $maxposition,
            'watchedseconds'        => $progress ? (int)$progress->watchedseconds : 0,
            'watchedintervals'      => $progress && !empty($progress->watchedintervals) ? $progress->watchedintervals : '[]',
            'percentcompleted'      => $percentcompleted,
            'completionminpercent'  => (int)$smartvideo->completionminpercent,
            'preventseeking'        => !empty($smartvideo->preventseeking) ? 1 : 0,
            'watermarkenabled'      => !empty($smartvideo->watermarkenabled) ? 1 : 0,
            'watermarktop'          => 15,
            'watermarkleft'         => 10,
            'studentlabel'          => fullname($USER) . ' (#' . (int)$USER->id . ')',
            'questionsjson'         => json_encode($questionsdata),
            'chaptersjson'          => json_encode($chaptersdata),
            'calloutsjson'          => json_encode($calloutsdata),
            'cuesjson'              => json_encode($primarycues),
            'notesjson'             => json_encode($notesdata),
            'discussionsjson'       => json_encode($discussionsdata),
            'activecalloutjson'     => '',
            'activequestionjson'    => '',
            'questionfeedbackhtml'  => '',
            'questioncancontinue'   => 0,
            'questioniscorrect'     => 0,
            'questionsubmitting'    => 0,
            'newnotecontent'        => '',
            'newquestioncontent'    => '',
            'replyparentid'         => 0,
            'replycontent'          => '',
            'reportfindings'        => $report ? (string)$report->findings : '',
            'reportimpression'      => $report ? (string)$report->impression : '',
            'reportdiagnosis'       => $report ? (string)$report->diagnosis : '',
            'reportrecommendations' => $report ? (string)$report->recommendations : '',
            'reportstatus'          => $report ? (string)$report->status : 'draft',
            'reportissubmitted'     => ($report && $report->status === 'submitted') ? 1 : 0,
            'reportsaving'          => 0,
        ];

        return [
            'templates' => [
                [
                    'id'   => 'main',
                    'html' => $OUTPUT->render_from_template('mod_smartvideo/mobileapp/course_view', $templatedata),
                ],
            ],
            'javascript' => file_get_contents(__DIR__ . '/../../js/mobileapp/player.js'),
            'otherdata'  => $otherdata,
            'files'      => $mobilefiles,
        ];
    }

    /**
     * Resolve external video URL into an embeddable iframe URL if applicable.
     *
     * @param string $videosource Provider identifier.
     * @param string $videourl Raw video URL.
     * @return array [bool $isiframe, string $embedurl]
     */
    private static function resolve_external_embed(string $videosource, string $videourl): array {
        $url = trim($videourl);
        if (empty($url)) {
            return [false, ''];
        }

        if ($videosource === 'youtube' || preg_match('/(?:youtube\.com|youtu\.be)/i', $url)) {
            if (preg_match('/(?:[?&]v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/i', $url, $m)) {
                return [true, 'https://www.youtube.com/embed/' . $m[1] . '?playsinline=1&rel=0'];
            }
        }

        if ($videosource === 'vimeo' || strpos($url, 'vimeo.com') !== false) {
            if (preg_match('/vimeo\.com\/(?:video\/)?(\d+)/i', $url, $m)) {
                return [true, 'https://player.vimeo.com/video/' . $m[1] . '?playsinline=1'];
            }
        }

        if ($videosource === 'dailymotion' || strpos($url, 'dailymotion.com') !== false) {
            if (preg_match('/dailymotion\.com\/(?:embed\/)?video\/([a-zA-Z0-9]+)/i', $url, $m)) {
                return [true, 'https://www.dailymotion.com/embed/video/' . $m[1] . '?playsinline=1'];
            }
        }

        if ($videosource === 'screenpal' || strpos($url, 'screenpal.com') !== false) {
            if (preg_match('/screenpal\.com\/(?:watch|player)\/([a-zA-Z0-9]+)/i', $url, $m)) {
                return [true, 'https://go.screenpal.com/player/' . $m[1] . '?FF=1&title=0'];
            }
        }

        if ($videosource === 'wistia' || strpos($url, 'wistia.') !== false) {
            if (preg_match('/(?:medias|embed\/iframe)\/([a-zA-Z0-9]+)/i', $url, $m)) {
                return [true, 'https://fast.wistia.net/embed/iframe/' . $m[1]];
            }
        }

        if ($videosource === 'bunnystream' && strpos($url, 'mediadelivery.net') !== false) {
            $embed = str_replace('/play/', '/embed/', $url);
            return [true, $embed];
        }

        return [false, $url];
    }
}
