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
use question_engine;
use qubaid_list;

/**
 * External web service to delete an interactive question cuepoint.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class delete_cuepoint extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'  => new external_value(PARAM_INT, 'Course module ID'),
            'cueid' => new external_value(PARAM_INT, 'Cuepoint ID to delete'),
        ]);
    }

    /**
     * Execute deletion.
     *
     * @param int $cmid Course module ID.
     * @param int $cueid Cuepoint ID.
     * @return array
     */
    public static function execute(int $cmid, int $cueid): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'  => $cmid,
            'cueid' => $cueid,
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
        $cue = $DB->get_record('smartvideo_questions', [
            'id'         => $params['cueid'],
            'instanceid' => $instance->id,
        ], '*', MUST_EXIST);

        // Clean up question engine usages.
        $qubaids = $DB->get_fieldset_select(
            'smartvideo_qattempts',
            'qubaid',
            'svquestionid = :cueid AND qubaid > 0',
            ['cueid' => $cue->id]
        );

        if (!empty($qubaids)) {
            question_engine::delete_questions_usage_by_activities(new qubaid_list($qubaids));
        }

        $DB->delete_records('smartvideo_qattempts', ['svquestionid' => $cue->id]);
        $DB->delete_records('smartvideo_questions', ['id' => $cue->id]);

        return [
            'status'  => true,
            'success' => true,
        ];
    }

    /**
     * Returns structure.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status'  => new external_value(PARAM_BOOL, 'Operation status'),
            'success' => new external_value(PARAM_BOOL, 'Operation status', VALUE_DEFAULT, true),
        ]);
    }
}
