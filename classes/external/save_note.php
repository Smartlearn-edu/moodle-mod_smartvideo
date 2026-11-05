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
 * External web service to save or update a student's timestamped note.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_note extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'     => new external_value(PARAM_INT, 'Course module ID'),
            'noteid'   => new external_value(PARAM_INT, 'Note ID (0 to create)', VALUE_DEFAULT, 0),
            'timecode' => new external_value(PARAM_INT, 'Timestamp in seconds'),
            'content'  => new external_value(PARAM_RAW, 'Note text content'),
        ]);
    }

    /**
     * Execute save note.
     *
     * @param int $cmid Course module ID.
     * @param int $noteid Note ID.
     * @param int $timecode Timestamp in seconds.
     * @param string $content Note text content.
     * @return array
     */
    public static function execute(int $cmid, int $noteid, int $timecode, string $content): array {
        global $DB, $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'     => $cmid,
            'noteid'   => $noteid,
            'timecode' => $timecode,
            'content'  => $content,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/smartvideo:view', $context);

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $content = trim($params['content']);
        if ($content === '') {
            throw new \invalid_parameter_exception('Note content cannot be empty.');
        }

        $now = time();
        $record = new stdClass();
        $record->instanceid   = $smartvideo->id;
        $record->userid       = $USER->id;
        $record->timecode     = max(0, $params['timecode']);
        $record->content      = $content;
        $record->timemodified = $now;

        if (!empty($params['noteid'])) {
            $existing = $DB->get_record('smartvideo_notes', [
                'id'         => $params['noteid'],
                'instanceid' => $smartvideo->id,
                'userid'     => $USER->id,
            ], '*', MUST_EXIST);
            $record->id = $existing->id;
            $DB->update_record('smartvideo_notes', $record);
            $id = $existing->id;
        } else {
            $record->timecreated = $now;
            $id = $DB->insert_record('smartvideo_notes', $record);
        }

        $mins = floor($record->timecode / 60);
        $secs = $record->timecode % 60;

        return [
            'status'        => true,
            'id'            => (int)$id,
            'timecode'      => (int)$record->timecode,
            'timeformatted' => sprintf('%02d:%02d', $mins, $secs),
            'content'       => $record->content,
            'timemodified'  => (int)$now,
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status'        => new external_value(PARAM_BOOL, 'Operation success status'),
            'id'            => new external_value(PARAM_INT, 'Note ID'),
            'timecode'      => new external_value(PARAM_INT, 'Timestamp in seconds'),
            'timeformatted' => new external_value(PARAM_TEXT, 'Formatted timecode (MM:SS)'),
            'content'       => new external_value(PARAM_RAW, 'Note content'),
            'timemodified'  => new external_value(PARAM_INT, 'Last modified timestamp'),
        ]);
    }
}
