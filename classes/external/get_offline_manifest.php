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

namespace mod_smartvideo\external;

use context_module;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use mod_smartvideo\question_helper;
use moodle_url;

/**
 * External web service to generate the offline download manifest for Moodle Mobile.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_offline_manifest extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module ID'),
        ]);
    }

    /**
     * Generate offline download manifest.
     *
     * @param int $cmid Course module ID.
     * @return array Manifest data.
     */
    public static function execute(int $cmid): array {
        global $DB, $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('mod/smartvideo:view', $context);

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);
        $allowoffline = !isset($smartvideo->allowofflinedownload) || !empty($smartvideo->allowofflinedownload);

        if (!$allowoffline) {
            return [
                'status'            => false,
                'errormessage'      => get_string('novideowarning', 'mod_smartvideo'),
                'mediaid'           => 0,
                'title'             => $smartvideo->name,
                'duration'          => (int)$smartvideo->duration,
                'durationformatted' => '00:00',
                'hlsjsurl'          => '',
                'sitesalt'          => '',
                'keybase64'         => '',
                'ivhex'             => '',
                'tiers'             => [],
                'questions'         => [],
                'chapters'          => [],
                'callouts'          => [],
                'cues'              => [],
            ];
        }

        $videosource = !empty($smartvideo->videosource) ? $smartvideo->videosource : 'securelibrary';
        if ($videosource !== 'securelibrary' || empty($smartvideo->mediaid)) {
            return [
                'status'            => false,
                'errormessage'      => get_string('invalidvideourl', 'mod_smartvideo'),
                'mediaid'           => 0,
                'title'             => $smartvideo->name,
                'duration'          => (int)($smartvideo->duration ?? 0),
                'durationformatted' => '00:00',
                'hlsjsurl'          => '',
                'sitesalt'          => '',
                'keybase64'         => '',
                'ivhex'             => '',
                'tiers'             => [],
                'questions'         => [],
                'chapters'          => [],
                'callouts'          => [],
                'cues'              => [],
            ];
        }

        $media = $DB->get_record('local_securevideolibrary_media', ['id' => $smartvideo->mediaid]);
        if (!$media || $media->status !== LOCAL_SECUREVIDEOLIBRARY_STATUS_READY) {
            return [
                'status'            => false,
                'errormessage'      => get_string('videonotready', 'mod_smartvideo'),
                'mediaid'           => 0,
                'title'             => $smartvideo->name,
                'duration'          => 0,
                'durationformatted' => '00:00',
                'hlsjsurl'          => '',
                'sitesalt'          => '',
                'keybase64'         => '',
                'ivhex'             => '',
                'tiers'             => [],
                'questions'         => [],
                'chapters'          => [],
                'callouts'          => [],
                'cues'              => [],
            ];
        }

        $mediadir = \local_securevideolibrary\storage::get_media_dir((int)$media->id, false);
        if (!is_dir($mediadir)) {
            return [
                'status'            => false,
                'errormessage'      => get_string('videonotready', 'mod_smartvideo'),
                'mediaid'           => 0,
                'title'             => $smartvideo->name,
                'duration'          => 0,
                'durationformatted' => '00:00',
                'hlsjsurl'          => '',
                'sitesalt'          => '',
                'keybase64'         => '',
                'ivhex'             => '',
                'tiers'             => [],
                'questions'         => [],
                'chapters'          => [],
                'callouts'          => [],
                'cues'              => [],
            ];
        }

        // Generate long-lived (30-day) mobile stream token for downloading segments.
        $mstoken = \local_securevideolibrary\token_manager::generate_mobile_stream_token(
            (int)$USER->id,
            (int)$media->id,
            (int)$cm->id,
            86400 * 30
        );

        $hlsjsurl = (new moodle_url('/local/securevideolibrary/serve.php', [
            'file'    => 'hls.js',
            'mstoken' => $mstoken,
        ]))->out(false);

        $keyraw = !empty($media->encryptionkey) ? hex2bin($media->encryptionkey) : '';
        $keybase64 = base64_encode($keyraw);
        $ivhex = $media->encryptioniv ?? '';

        $duration = (int)$media->duration;
        $mins = (int)floor($duration / 60);
        $secs = (int)($duration % 60);
        $durationformatted = sprintf('%02d:%02d', $mins, $secs);

        // Build quality tiers by inspecting variant files on disk.
        $tiers = [];
        $hasvariants = file_exists($mediadir . '/variant_0.m3u8');

        if ($hasvariants) {
            $tierconfigs = [
                0 => ['id' => '360p', 'label' => get_string('quality_datasaver', 'mod_smartvideo', '360p'), 'resolution' => '360p'],
                1 => ['id' => '480p', 'label' => get_string('quality_standard', 'mod_smartvideo', '480p'), 'resolution' => '480p'],
                2 => ['id' => '720p', 'label' => get_string('quality_hd', 'mod_smartvideo', '720p'), 'resolution' => '720p'],
            ];

            foreach ($tierconfigs as $vidx => $cfg) {
                $vfile = $mediadir . '/variant_' . $vidx . '.m3u8';
                if (!file_exists($vfile)) {
                    continue;
                }
                $vcontent = file_get_contents($vfile);
                if (!$vcontent) {
                    continue;
                }

                $segments = [];
                $totalbytes = 0;
                $lines = preg_split('/\r\n|\r|\n/', $vcontent);
                $rewrittenlines = [];

                foreach ($lines as $line) {
                    $trim = trim($line);
                    if (empty($trim)) {
                        continue;
                    }
                    if (strpos($trim, '#EXT-X-KEY:') === 0) {
                        $rewrittenlines[] = '#EXT-X-KEY:METHOD=AES-128,URI="offline://key",IV=' . $ivhex;
                    } else if (strpos($trim, '#') === 0) {
                        $rewrittenlines[] = $trim;
                    } else if (preg_match('/^[a-zA-Z0-9_\-]+\.ts$/', $trim)) {
                        $segpath = $mediadir . '/' . $trim;
                        $segsize = file_exists($segpath) ? filesize($segpath) : 0;
                        $totalbytes += $segsize;
                        $segurl = (new moodle_url('/local/securevideolibrary/serve.php', [
                            'mediaid' => (int)$media->id,
                            'cmid'    => (int)$cm->id,
                            'file'    => $trim,
                            'mstoken' => $mstoken,
                        ]))->out(false);

                        $segments[] = [
                            'filename' => $trim,
                            'url'      => $segurl,
                            'size'     => (int)$segsize,
                        ];
                        $rewrittenlines[] = 'offline://' . $trim;
                    } else {
                        $rewrittenlines[] = $trim;
                    }
                }

                $tiers[] = [
                    'id'           => $cfg['id'],
                    'label'        => $cfg['label'],
                    'resolution'   => $cfg['resolution'],
                    'totalbytes'   => (int)$totalbytes,
                    'totalsize'    => display_size($totalbytes),
                    'playlisttext' => implode("\n", $rewrittenlines),
                    'segments'     => $segments,
                ];
            }
        }

        // Single bitrate fallback.
        if (empty($tiers)) {
            $plpath = $mediadir . '/playlist.m3u8';
            if (file_exists($plpath)) {
                $plcontent = file_get_contents($plpath);
                $segments = [];
                $totalbytes = 0;
                $lines = preg_split('/\r\n|\r|\n/', $plcontent);
                $rewrittenlines = [];

                foreach ($lines as $line) {
                    $trim = trim($line);
                    if (empty($trim)) {
                        continue;
                    }
                    if (strpos($trim, '#EXT-X-KEY:') === 0) {
                        $rewrittenlines[] = '#EXT-X-KEY:METHOD=AES-128,URI="offline://key",IV=' . $ivhex;
                    } else if (strpos($trim, '#') === 0) {
                        $rewrittenlines[] = $trim;
                    } else if (preg_match('/^[a-zA-Z0-9_\-]+\.ts$/', $trim)) {
                        $segpath = $mediadir . '/' . $trim;
                        $segsize = file_exists($segpath) ? filesize($segpath) : 0;
                        $totalbytes += $segsize;
                        $segurl = (new moodle_url('/local/securevideolibrary/serve.php', [
                            'mediaid' => (int)$media->id,
                            'cmid'    => (int)$cm->id,
                            'file'    => $trim,
                            'mstoken' => $mstoken,
                        ]))->out(false);

                        $segments[] = [
                            'filename' => $trim,
                            'url'      => $segurl,
                            'size'     => (int)$segsize,
                        ];
                        $rewrittenlines[] = 'offline://' . $trim;
                    } else {
                        $rewrittenlines[] = $trim;
                    }
                }

                $tiers[] = [
                    'id'           => 'single',
                    'label'        => get_string('quality_single', 'mod_smartvideo', 'Standard'),
                    'resolution'   => 'Standard',
                    'totalbytes'   => (int)$totalbytes,
                    'totalsize'    => display_size($totalbytes),
                    'playlisttext' => implode("\n", $rewrittenlines),
                    'segments'     => $segments,
                ];
            }
        }

        // Pre-cache interactive questions with salted hash for instant offline grading.
        $questionsdata = [];
        $sitesalt = substr(hash('sha256', get_site_identifier()), 0, 16);
        $cues = $DB->get_records('smartvideo_questions', ['instanceid' => $smartvideo->id], 'timecode ASC');

        foreach ($cues as $c) {
            $attempt = question_helper::get_or_create_attempt($cm->id, $c->id, $USER->id, false);
            $qm = (int)floor($c->timecode / 60);
            $qs = (int)($c->timecode % 60);

            // Compute salted hashes of correct answer choices for offline checking.
            $correcthashes = [];
            $latestqid = question_helper::get_latest_question_id((int)$c->questionbankentryid, (int)$c->questionid);
            if ($latestqid > 0) {
                $answers = $DB->get_records('question_answers', ['question' => $latestqid]);
                foreach ($answers as $ans) {
                    if ((float)$ans->fraction >= 0.99) {
                        $correcthashes[] = hash('sha256', $c->id . ':' . $ans->id . ':' . $sitesalt);
                        $correcthashes[] = hash('sha256', $c->id . ':' . trim($ans->answer) . ':' . $sitesalt);
                    }
                }
            }

            $questionsdata[] = [
                'svquestionid'   => (int)$c->id,
                'title'          => !empty($c->title) ? format_string($c->title) : get_string('knowledgecheck', 'mod_smartvideo'),
                'timecode'       => (int)$c->timecode,
                'timeformatted'  => sprintf('%02d:%02d', $qm, $qs),
                'requirecorrect' => (int)$c->requirecorrect,
                'rewindonfail'   => (int)($c->rewindonfail ?? 0),
                'rewindto'       => isset($c->rewindto) ? (int)$c->rewindto : -1,
                'qubaid'         => (int)$attempt['qubaid'],
                'slot'           => (int)$attempt['slot'],
                'passed'         => !empty($attempt['passed']),
                'html'           => $attempt['html'] ?? '',
                'correcthashes'  => json_encode($correcthashes),
            ];
        }

        // Chapters.
        $chaptersdata = [];
        $chapindex = 1;
        $chapters = $DB->get_records('smartvideo_chapters', ['instanceid' => $smartvideo->id], 'timecode ASC');
        foreach ($chapters as $ch) {
            $cmins = (int)floor($ch->timecode / 60);
            $csecs = (int)($ch->timecode % 60);
            $chaptersdata[] = [
                'id'            => (int)$ch->id,
                'index'         => $chapindex++,
                'timecode'      => (int)$ch->timecode,
                'timeformatted' => sprintf('%02d:%02d', $cmins, $csecs),
                'title'         => format_string($ch->title),
            ];
        }

        // Callouts.
        $calloutsdata = [];
        $callouts = $DB->get_records('smartvideo_callouts', ['instanceid' => $smartvideo->id], 'timecode ASC');
        foreach ($callouts as $cl) {
            $calloutsdata[] = [
                'id'        => (int)$cl->id,
                'timecode'  => (int)$cl->timecode,
                'duration'  => (int)$cl->duration,
                'title'     => format_string($cl->title),
                'body'      => format_text($cl->body, FORMAT_HTML),
                'linkurl'   => $cl->linkurl ?? '',
                'linklabel' => !empty($cl->linklabel) ? format_string($cl->linklabel) : '',
                'haslink'   => !empty($cl->linkurl),
                'autopause' => !empty($cl->autopause),
            ];
        }

        // Subtitle cues.
        $cuesdata = [];
        $primarysub = $DB->get_record('smartvideo_subtitles', ['instanceid' => $smartvideo->id], '*', IGNORE_MULTIPLE);
        if ($primarysub && !empty($primarysub->content)) {
            $cuesdata = \mod_smartvideo\vtt_helper::parse_vtt($primarysub->content);
        } else {
            $libvtt = \local_securevideolibrary\storage::get_file_path((int)$media->id, 'subtitles.vtt');
            if ($libvtt && file_exists($libvtt)) {
                $cuesdata = \mod_smartvideo\vtt_helper::parse_vtt(file_get_contents($libvtt));
            }
        }

        return [
            'status'            => true,
            'errormessage'      => '',
            'mediaid'           => (int)$media->id,
            'title'             => $smartvideo->name,
            'duration'          => $duration,
            'durationformatted' => $durationformatted,
            'hlsjsurl'          => $hlsjsurl,
            'sitesalt'          => $sitesalt,
            'keybase64'         => $keybase64,
            'ivhex'             => $ivhex,
            'tiers'             => $tiers,
            'questions'         => $questionsdata,
            'chapters'          => $chaptersdata,
            'callouts'          => $calloutsdata,
            'cues'              => $cuesdata,
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status'            => new external_value(PARAM_BOOL, 'Status of operation'),
            'errormessage'      => new external_value(PARAM_TEXT, 'Error message if failed', VALUE_DEFAULT, ''),
            'mediaid'           => new external_value(PARAM_INT, 'Media ID'),
            'title'             => new external_value(PARAM_TEXT, 'Video title'),
            'duration'          => new external_value(PARAM_INT, 'Duration in seconds'),
            'durationformatted' => new external_value(PARAM_TEXT, 'Formatted duration MM:SS'),
            'hlsjsurl'          => new external_value(PARAM_URL, 'URL to fetch bundled local HLS.js', VALUE_DEFAULT, ''),
            'sitesalt'          => new external_value(PARAM_ALPHANUM, 'Salt for offline choice validation', VALUE_DEFAULT, ''),
            'keybase64'         => new external_value(PARAM_RAW, 'Base64 encoded 16-byte AES decryption key'),
            'ivhex'             => new external_value(PARAM_ALPHANUM, 'Hex encoded initialization vector'),
            'tiers'             => new external_multiple_structure(
                new external_single_structure([
                    'id'           => new external_value(PARAM_ALPHANUM, 'Tier identifier (360p, 480p, 720p, single)'),
                    'label'        => new external_value(PARAM_TEXT, 'Human readable label'),
                    'resolution'   => new external_value(PARAM_TEXT, 'Resolution label'),
                    'totalbytes'   => new external_value(PARAM_INT, 'Total size in bytes'),
                    'totalsize'    => new external_value(PARAM_TEXT, 'Human readable size (e.g. 34.2 MB)'),
                    'playlisttext' => new external_value(PARAM_RAW, 'Offline rewritten m3u8 playlist content'),
                    'segments'     => new external_multiple_structure(
                        new external_single_structure([
                            'filename' => new external_value(PARAM_FILE, 'Segment filename'),
                            'url'      => new external_value(PARAM_URL, 'Download URL with auth token'),
                            'size'     => new external_value(PARAM_INT, 'Segment size in bytes'),
                        ]),
                        'List of video segments for this tier'
                    ),
                ]),
                'Available quality tiers'
            ),
            'questions'         => new external_multiple_structure(
                new external_single_structure([
                    'svquestionid'   => new external_value(PARAM_INT, 'Cuepoint ID'),
                    'title'          => new external_value(PARAM_TEXT, 'Question title'),
                    'timecode'       => new external_value(PARAM_INT, 'Timecode in seconds'),
                    'timeformatted'  => new external_value(PARAM_TEXT, 'Formatted timecode'),
                    'requirecorrect' => new external_value(PARAM_INT, 'Require correct to continue'),
                    'rewindonfail'   => new external_value(PARAM_INT, 'Seconds to rewind on fail'),
                    'rewindto'       => new external_value(PARAM_INT, 'Rewind target timestamp'),
                    'qubaid'         => new external_value(PARAM_INT, 'QUBA ID'),
                    'slot'           => new external_value(PARAM_INT, 'Slot ID'),
                    'passed'         => new external_value(PARAM_BOOL, 'Whether already passed'),
                    'html'           => new external_value(PARAM_RAW, 'Rendered question HTML'),
                    'correcthashes'  => new external_value(PARAM_RAW, 'JSON array of salted SHA-256 correct choice hashes'),
                ]),
                'Pre-cached interactive questions for offline use'
            ),
            'chapters'          => new external_multiple_structure(
                new external_single_structure([
                    'id'            => new external_value(PARAM_INT, 'Chapter ID'),
                    'index'         => new external_value(PARAM_INT, 'Chapter sequence index'),
                    'timecode'      => new external_value(PARAM_INT, 'Timecode in seconds'),
                    'timeformatted' => new external_value(PARAM_TEXT, 'Formatted timecode'),
                    'title'         => new external_value(PARAM_TEXT, 'Chapter title'),
                ]),
                'Video chapters'
            ),
            'callouts'          => new external_multiple_structure(
                new external_single_structure([
                    'id'        => new external_value(PARAM_INT, 'Callout ID'),
                    'timecode'  => new external_value(PARAM_INT, 'Timecode in seconds'),
                    'duration'  => new external_value(PARAM_INT, 'Display duration in seconds'),
                    'title'     => new external_value(PARAM_TEXT, 'Callout title'),
                    'body'      => new external_value(PARAM_RAW, 'Callout body HTML'),
                    'linkurl'   => new external_value(PARAM_RAW, 'Link URL'),
                    'linklabel' => new external_value(PARAM_TEXT, 'Link label'),
                    'haslink'   => new external_value(PARAM_BOOL, 'Whether callout has link'),
                    'autopause' => new external_value(PARAM_BOOL, 'Whether video autopauses'),
                ]),
                'In-video callout cards'
            ),
            'cues'              => new external_multiple_structure(
                new external_single_structure([
                    'start'          => new external_value(PARAM_FLOAT, 'Start time in seconds'),
                    'end'            => new external_value(PARAM_FLOAT, 'End time in seconds'),
                    'startformatted' => new external_value(PARAM_TEXT, 'Formatted start time'),
                    'text'           => new external_value(PARAM_RAW, 'Subtitle text cue'),
                ]),
                'Subtitle text cues'
            ),
        ]);
    }
}
