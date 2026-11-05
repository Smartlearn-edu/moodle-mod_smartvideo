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

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_module;
use stdClass;

/**
 * External web service to create or update an interactive question cuepoint.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_cuepoint extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'                => new external_value(PARAM_INT, 'Course module ID'),
            'cueid'               => new external_value(PARAM_INT, 'Cuepoint ID (0 to create)', VALUE_DEFAULT, 0),
            'questionbankentryid' => new external_value(PARAM_INT, 'Question bank entry ID', VALUE_DEFAULT, 0),
            'questionid'          => new external_value(PARAM_INT, 'Question ID'),
            'timecode'            => new external_value(PARAM_INT, 'Timecode in seconds'),
            'title'               => new external_value(PARAM_TEXT, 'Cuepoint title / label', VALUE_DEFAULT, ''),
            'requirecorrect'      => new external_value(PARAM_INT, '1 = require correct answer', VALUE_DEFAULT, 1),
            'rewindonfail'        => new external_value(PARAM_INT, 'Seconds to rewind on failure', VALUE_DEFAULT, 0),
            'rewindto'            => new external_value(PARAM_INT, 'Target timestamp to rewind to on failure, -1 for retry in place', VALUE_DEFAULT, -1),
            'questionstyle'       => new external_value(PARAM_ALPHA, 'Display style: compact or native', VALUE_DEFAULT, 'compact'),
        ]);
    }

    /**
     * Execute save.
     *
     * @param int $cmid Course module ID.
     * @param int $cueid Existing cuepoint ID or 0.
     * @param int $questionbankentryid Question bank entry ID.
     * @param int $questionid Question ID.
     * @param int $timecode Playback timestamp in seconds.
     * @param string $title Title or label.
     * @param int $requirecorrect 1 or 0.
     * @param int $rewindonfail Seconds to rewind.
     * @param int $rewindto Target timestamp to rewind to, or -1.
     * @param string $questionstyle Style name ('compact' or 'native').
     * @return array
     */
    public static function execute(
        int $cmid,
        int $cueid = 0,
        int $questionbankentryid = 0,
        int $questionid = 0,
        int $timecode = 0,
        string $title = '',
        int $requirecorrect = 1,
        int $rewindonfail = 0,
        int $rewindto = -1,
        string $questionstyle = 'compact'
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'                => $cmid,
            'cueid'               => $cueid,
            'questionbankentryid' => $questionbankentryid,
            'questionid'          => $questionid,
            'timecode'            => $timecode,
            'title'               => $title,
            'requirecorrect'      => $requirecorrect,
            'rewindonfail'        => $rewindonfail,
            'rewindto'            => $rewindto,
            'questionstyle'       => $questionstyle,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        if (
            !has_capability('moodle/course:manageactivities', $context)
            && !has_capability('mod/smartvideo:addinstance', $context)
            && !has_capability('mod/smartvideo:managequestions', $context)
        ) {
            throw new \moodle_exception('nopermissions', 'error', '', 'manage questions');
        }

        $instance = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $qbeid = $params['questionbankentryid'];
        $qid   = $params['questionid'];

        if ($params['cueid'] > 0) {
            $cue = $DB->get_record('smartvideo_questions', [
                'id'         => $params['cueid'],
                'instanceid' => $instance->id,
            ], '*', MUST_EXIST);

            if ($qid <= 0) {
                $qid = (int)$cue->questionid;
            }
            if ($qbeid <= 0) {
                $qbeid = (int)$cue->questionbankentryid;
            }
        }

        // Resolve question bank entry ID if missing.
        if ($qbeid <= 0 && $qid > 0) {
            $qbeid = (int)$DB->get_field_sql(
                "SELECT qv.questionbankentryid
                   FROM {question_versions} qv
                  WHERE qv.questionid = :qid",
                ['qid' => $qid],
                IGNORE_MULTIPLE
            );
        }

        // Resolve question ID if missing.
        if ($qid <= 0 && $qbeid > 0) {
            $qid = (int)$DB->get_field_sql(
                "SELECT qv.questionid
                   FROM {question_versions} qv
                  WHERE qv.questionbankentryid = :qbeid
               ORDER BY qv.version DESC",
                ['qbeid' => $qbeid],
                IGNORE_MULTIPLE
            );
        }

        if ($qid <= 0) {
            throw new \moodle_exception('invalidquestion', 'mod_smartvideo');
        }

        $timecode = max(0, $params['timecode']);
        if (!empty($instance->mediaid)) {
            $duration = (int)$DB->get_field('local_securevideolibrary_media', 'duration', ['id' => $instance->mediaid]);
            if ($duration > 0 && $timecode > $duration) {
                $timecode = $duration;
            }
        }

        $now = time();
        $rewindto = isset($params['rewindto']) ? (int)$params['rewindto'] : -1;
        if ($rewindto > $timecode) {
            $rewindto = $timecode;
        }
        $qstyle = (isset($params['questionstyle']) && $params['questionstyle'] === 'native') ? 'native' : 'compact';

        if ($params['cueid'] > 0) {
            $cue->questionbankentryid = $qbeid;
            $cue->questionid          = $qid;
            $cue->timecode            = $timecode;
            $cue->title               = $params['title'];
            $cue->requirecorrect      = !empty($params['requirecorrect']) ? 1 : 0;
            $cue->rewindonfail        = max(0, $params['rewindonfail']);
            $cue->rewindto            = $rewindto;
            $cue->questionstyle       = $qstyle;
            $cue->timemodified        = $now;

            $DB->update_record('smartvideo_questions', $cue);
            $savedid = $cue->id;
        } else {
            $cue = new stdClass();
            $cue->instanceid          = $instance->id;
            $cue->questionbankentryid = $qbeid;
            $cue->questionid          = $qid;
            $cue->timecode            = $timecode;
            $cue->title               = $params['title'];
            $cue->requirecorrect      = !empty($params['requirecorrect']) ? 1 : 0;
            $cue->rewindonfail        = max(0, $params['rewindonfail']);
            $cue->rewindto            = $rewindto;
            $cue->questionstyle       = $qstyle;
            $cue->timecreated         = $now;
            $cue->timemodified        = $now;

            $savedid = $DB->insert_record('smartvideo_questions', $cue);
        }

        return [
            'status' => true,
            'cueid'  => (int)$savedid,
        ];
    }

    /**
     * Returns structure.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status' => new external_value(PARAM_BOOL, 'Operation status'),
            'cueid'  => new external_value(PARAM_INT, 'Saved cuepoint ID'),
        ]);
    }
}
