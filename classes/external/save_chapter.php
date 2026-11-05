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
 * External web service to create or update a video chapter marker.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_chapter extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'      => new external_value(PARAM_INT, 'Course module ID'),
            'chapterid' => new external_value(PARAM_INT, 'Chapter ID (0 to create)', VALUE_DEFAULT, 0),
            'timecode'  => new external_value(PARAM_INT, 'Start time in seconds'),
            'title'     => new external_value(PARAM_TEXT, 'Chapter title'),
        ]);
    }

    /**
     * Execute save chapter.
     *
     * @param int $cmid Course module ID.
     * @param int $chapterid Existing chapter ID or 0.
     * @param int $timecode Start time in seconds.
     * @param string $title Chapter title.
     * @return array
     */
    public static function execute(int $cmid, int $chapterid, int $timecode, string $title): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'      => $cmid,
            'chapterid' => $chapterid,
            'timecode'  => $timecode,
            'title'     => $title,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('moodle/course:manageactivities', $context);

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $title = trim($params['title']);
        if (empty($title)) {
            throw new \invalid_parameter_exception('Chapter title cannot be empty.');
        }

        $now = time();
        $record = new stdClass();
        $record->instanceid   = $smartvideo->id;
        $record->timecode     = max(0, $params['timecode']);
        $record->title        = $title;
        $record->timemodified = $now;

        if (!empty($params['chapterid'])) {
            $existing = $DB->get_record('smartvideo_chapters', [
                'id'         => $params['chapterid'],
                'instanceid' => $smartvideo->id,
            ], '*', MUST_EXIST);
            $record->id = $existing->id;
            $DB->update_record('smartvideo_chapters', $record);
            $id = $existing->id;
        } else {
            $record->timecreated = $now;
            $id = $DB->insert_record('smartvideo_chapters', $record);
        }

        $mins = floor($record->timecode / 60);
        $secs = $record->timecode % 60;
        $timeformatted = sprintf('%02d:%02d', $mins, $secs);

        return [
            'status'        => true,
            'success'       => true,
            'id'            => (int)$id,
            'timecode'      => (int)$record->timecode,
            'timeformatted' => $timeformatted,
            'title'         => $record->title,
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status'        => new external_value(PARAM_BOOL, 'True on success', VALUE_DEFAULT, true),
            'success'       => new external_value(PARAM_BOOL, 'True on success', VALUE_DEFAULT, true),
            'id'            => new external_value(PARAM_INT, 'Chapter ID'),
            'timecode'      => new external_value(PARAM_INT, 'Timecode in seconds'),
            'timeformatted' => new external_value(PARAM_TEXT, 'Formatted time (MM:SS)'),
            'title'         => new external_value(PARAM_TEXT, 'Chapter title'),
        ]);
    }
}
