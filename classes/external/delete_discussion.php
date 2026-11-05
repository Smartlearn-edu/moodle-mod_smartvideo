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

/**
 * External web service to delete a discussion comment or question.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class delete_discussion extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'         => new external_value(PARAM_INT, 'Course module ID'),
            'discussionid' => new external_value(PARAM_INT, 'Discussion record ID to delete'),
        ]);
    }

    /**
     * Execute delete discussion.
     *
     * @param int $cmid Course module ID.
     * @param int $discussionid Discussion ID.
     * @return array
     */
    public static function execute(int $cmid, int $discussionid): array {
        global $DB, $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'         => $cmid,
            'discussionid' => $discussionid,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/smartvideo:view', $context);

        $canmanage = has_capability('moodle/course:manageactivities', $context)
            || has_capability('mod/smartvideo:addinstance', $context);

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $record = $DB->get_record('smartvideo_discussions', [
            'id'         => $params['discussionid'],
            'instanceid' => $smartvideo->id,
        ], '*', MUST_EXIST);

        if ($record->userid != $USER->id && !$canmanage) {
            throw new \moodle_exception('nopermissions', 'error', '', 'delete discussion');
        }

        // Delete discussion record and any replies.
        $DB->delete_records('smartvideo_discussions', ['id' => $record->id]);
        $DB->delete_records('smartvideo_discussions', ['parentid' => $record->id]);

        return [
            'status' => true,
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status' => new external_value(PARAM_BOOL, 'Operation success status'),
        ]);
    }
}
