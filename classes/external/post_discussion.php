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
 * External web service to post a timestamped discussion question or reply.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class post_discussion extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'     => new external_value(PARAM_INT, 'Course module ID'),
            'timecode' => new external_value(PARAM_INT, 'Video timecode in seconds or 0', VALUE_DEFAULT, 0),
            'content'  => new external_value(PARAM_RAW, 'Question or comment text'),
            'parentid' => new external_value(PARAM_INT, 'Parent question ID for replies (0 for new thread)', VALUE_DEFAULT, 0),
        ]);
    }

    /**
     * Execute post discussion.
     *
     * @param int $cmid Course module ID.
     * @param int $timecode Timecode in seconds.
     * @param string $content Content text.
     * @param int $parentid Parent ID.
     * @return array
     */
    public static function execute(int $cmid, int $timecode = 0, string $content = '', int $parentid = 0): array {
        global $DB, $USER, $OUTPUT;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'     => $cmid,
            'timecode' => $timecode,
            'content'  => $content,
            'parentid' => $parentid,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/smartvideo:view', $context);

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $content = trim($params['content']);
        if ($content === '') {
            throw new \invalid_parameter_exception('Comment text cannot be empty.');
        }

        $now = time();
        $record = new stdClass();
        $record->instanceid   = $smartvideo->id;
        $record->userid       = $USER->id;
        $record->timecode     = max(0, $params['timecode']);
        $record->content      = $content;
        $record->parentid     = max(0, $params['parentid']);
        $record->timecreated  = $now;
        $record->timemodified = $now;

        $id = $DB->insert_record('smartvideo_discussions', $record);

        $mins = floor($record->timecode / 60);
        $secs = $record->timecode % 60;
        $timeformatted = ($record->timecode > 0) ? sprintf('%02d:%02d', $mins, $secs) : '';

        return [
            'status'               => true,
            'id'                   => (int)$id,
            'userid'               => (int)$USER->id,
            'userfullname'         => fullname($USER),
            'userpicture'          => $OUTPUT->user_picture($USER, ['size' => 30]),
            'timecode'             => (int)$record->timecode,
            'timeformatted'        => $timeformatted,
            'hastimecode'          => ($record->timecode > 0),
            'content'              => format_text($record->content, FORMAT_PLAIN),
            'parentid'             => (int)$record->parentid,
            'timecreated'          => (int)$now,
            'timecreatedformatted' => userdate($now, get_string('strftimedatetimeshort', 'langconfig')),
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status'               => new external_value(PARAM_BOOL, 'Operation success status'),
            'id'                   => new external_value(PARAM_INT, 'Created discussion ID'),
            'userid'               => new external_value(PARAM_INT, 'User ID'),
            'userfullname'         => new external_value(PARAM_TEXT, 'User full name'),
            'userpicture'          => new external_value(PARAM_RAW, 'User avatar HTML'),
            'timecode'             => new external_value(PARAM_INT, 'Timestamp in seconds'),
            'timeformatted'        => new external_value(PARAM_TEXT, 'Formatted timecode'),
            'hastimecode'          => new external_value(PARAM_BOOL, 'Whether linked to timecode'),
            'content'              => new external_value(PARAM_RAW, 'Comment text'),
            'parentid'             => new external_value(PARAM_INT, 'Parent discussion ID'),
            'timecreated'          => new external_value(PARAM_INT, 'Created timestamp'),
            'timecreatedformatted' => new external_value(PARAM_TEXT, 'Formatted creation date/time'),
        ]);
    }
}
