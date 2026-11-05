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
 * External web service to delete a student's note.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class delete_note extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'   => new external_value(PARAM_INT, 'Course module ID'),
            'noteid' => new external_value(PARAM_INT, 'Note ID to delete'),
        ]);
    }

    /**
     * Execute delete note.
     *
     * @param int $cmid Course module ID.
     * @param int $noteid Note ID.
     * @return array
     */
    public static function execute(int $cmid, int $noteid): array {
        global $DB, $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'   => $cmid,
            'noteid' => $noteid,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/smartvideo:view', $context);

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $note = $DB->get_record('smartvideo_notes', [
            'id'         => $params['noteid'],
            'instanceid' => $smartvideo->id,
            'userid'     => $USER->id,
        ], '*', MUST_EXIST);

        $DB->delete_records('smartvideo_notes', ['id' => $note->id]);

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
