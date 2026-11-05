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
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use context_module;

/**
 * External web service to fetch a student's notes for a video activity.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_notes extends external_api {
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
     * Execute get notes.
     *
     * @param int $cmid Course module ID.
     * @return array List of notes.
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

        $records = $DB->get_records('smartvideo_notes', [
            'instanceid' => $smartvideo->id,
            'userid'     => $USER->id,
        ], 'timecode ASC');

        $result = [];
        foreach ($records as $note) {
            $mins = floor($note->timecode / 60);
            $secs = $note->timecode % 60;
            $result[] = [
                'id'            => (int)$note->id,
                'timecode'      => (int)$note->timecode,
                'timeformatted' => sprintf('%02d:%02d', $mins, $secs),
                'content'       => $note->content,
                'timemodified'  => (int)$note->timemodified,
            ];
        }

        return $result;
    }

    /**
     * Return structure definition.
     *
     * @return external_multiple_structure
     */
    public static function execute_returns(): external_multiple_structure {
        return new external_multiple_structure(
            new external_single_structure([
                'id'            => new external_value(PARAM_INT, 'Note ID'),
                'timecode'      => new external_value(PARAM_INT, 'Timestamp in seconds'),
                'timeformatted' => new external_value(PARAM_TEXT, 'Formatted timecode (MM:SS)'),
                'content'       => new external_value(PARAM_RAW, 'Note content'),
                'timemodified'  => new external_value(PARAM_INT, 'Last modified timestamp'),
            ])
        );
    }
}
