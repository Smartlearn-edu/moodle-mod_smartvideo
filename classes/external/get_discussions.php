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
 * External web service to fetch timestamped Q&A discussions for a video activity.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_discussions extends external_api {
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
     * Execute get discussions.
     *
     * @param int $cmid Course module ID.
     * @return array
     */
    public static function execute(int $cmid): array {
        global $DB, $USER, $OUTPUT;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/smartvideo:view', $context);

        $canmanage = has_capability('moodle/course:manageactivities', $context)
            || has_capability('mod/smartvideo:addinstance', $context);

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $records = $DB->get_records('smartvideo_discussions', ['instanceid' => $smartvideo->id], 'timecreated ASC');

        $users = [];
        if (!empty($records)) {
            $userids = array_unique(array_filter(array_map(function($rec) {
                return (int)$rec->userid;
            }, $records)));

            if (!empty($userids)) {
                if (class_exists('\core_user\fields')) {
                    $required = \core_user\fields::for_userpic()->get_required_fields();
                    $fieldlist = implode(', ', $required);
                } else {
                    $fieldlist = '*';
                }
                $users = $DB->get_records_list('user', 'id', $userids, '', $fieldlist);
            }
        }

        $discussions = [];
        $repliesByParent = [];

        foreach ($records as $rec) {
            $u = $users[$rec->userid] ?? null;
            $userfullname = $u ? fullname($u) : 'User';
            $userpicture = $u ? $OUTPUT->user_picture($u, ['size' => 30]) : '';

            $mins = floor($rec->timecode / 60);
            $secs = $rec->timecode % 60;
            $timeformatted = ($rec->timecode > 0) ? sprintf('%02d:%02d', $mins, $secs) : '';

            $item = [
                'id'                   => (int)$rec->id,
                'userid'               => (int)$rec->userid,
                'userfullname'         => $userfullname,
                'userpicture'          => $userpicture,
                'timecode'             => (int)$rec->timecode,
                'timeformatted'        => $timeformatted,
                'hastimecode'          => ($rec->timecode > 0),
                'content'              => format_text($rec->content, FORMAT_PLAIN),
                'rawcontent'           => $rec->content,
                'parentid'             => (int)$rec->parentid,
                'timecreated'          => (int)$rec->timecreated,
                'timecreatedformatted' => userdate($rec->timecreated, get_string('strftimedatetimeshort', 'langconfig')),
                'isauthor'             => ($rec->userid == $USER->id),
                'candelete'            => ($rec->userid == $USER->id || $canmanage),
                'replies'              => [],
            ];

            if ($rec->parentid > 0) {
                $repliesByParent[$rec->parentid][] = $item;
            } else {
                $discussions[$rec->id] = $item;
            }
        }

        // Attach replies to parents.
        $result = [];
        foreach ($discussions as $id => $disc) {
            if (isset($repliesByParent[$id])) {
                $disc['replies'] = $repliesByParent[$id];
                $disc['replycount'] = count($repliesByParent[$id]);
            } else {
                $disc['replycount'] = 0;
            }
            $result[] = $disc;
        }

        return [
            'discussions' => $result,
            'count'       => count($result),
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        $replystructure = new external_single_structure([
            'id'                   => new external_value(PARAM_INT, 'Discussion reply ID'),
            'userid'               => new external_value(PARAM_INT, 'Author user ID'),
            'userfullname'         => new external_value(PARAM_TEXT, 'Author full name'),
            'userpicture'          => new external_value(PARAM_RAW, 'Author avatar HTML'),
            'timecode'             => new external_value(PARAM_INT, 'Timestamp in seconds'),
            'timeformatted'        => new external_value(PARAM_TEXT, 'Formatted timecode'),
            'hastimecode'          => new external_value(PARAM_BOOL, 'Whether linked to timecode'),
            'content'              => new external_value(PARAM_RAW, 'Comment text content'),
            'rawcontent'           => new external_value(PARAM_RAW, 'Raw text content'),
            'parentid'             => new external_value(PARAM_INT, 'Parent discussion ID'),
            'timecreated'          => new external_value(PARAM_INT, 'Created timestamp'),
            'timecreatedformatted' => new external_value(PARAM_TEXT, 'Formatted creation date/time'),
            'isauthor'             => new external_value(PARAM_BOOL, 'Whether current user is author'),
            'candelete'            => new external_value(PARAM_BOOL, 'Whether user can delete'),
            'replies'              => new external_multiple_structure(new external_value(PARAM_RAW, 'Nested replies'), '', VALUE_DEFAULT, []),
        ]);

        return new external_single_structure([
            'count'       => new external_value(PARAM_INT, 'Total questions count'),
            'discussions' => new external_multiple_structure(
                new external_single_structure([
                    'id'                   => new external_value(PARAM_INT, 'Discussion thread ID'),
                    'userid'               => new external_value(PARAM_INT, 'Author user ID'),
                    'userfullname'         => new external_value(PARAM_TEXT, 'Author full name'),
                    'userpicture'          => new external_value(PARAM_RAW, 'Author avatar HTML'),
                    'timecode'             => new external_value(PARAM_INT, 'Timestamp in seconds'),
                    'timeformatted'        => new external_value(PARAM_TEXT, 'Formatted timecode'),
                    'hastimecode'          => new external_value(PARAM_BOOL, 'Whether linked to timecode'),
                    'content'              => new external_value(PARAM_RAW, 'Comment text content'),
                    'rawcontent'           => new external_value(PARAM_RAW, 'Raw text content'),
                    'parentid'             => new external_value(PARAM_INT, 'Parent discussion ID'),
                    'timecreated'          => new external_value(PARAM_INT, 'Created timestamp'),
                    'timecreatedformatted' => new external_value(PARAM_TEXT, 'Formatted creation date/time'),
                    'isauthor'             => new external_value(PARAM_BOOL, 'Whether current user is author'),
                    'candelete'            => new external_value(PARAM_BOOL, 'Whether user can delete'),
                    'replycount'           => new external_value(PARAM_INT, 'Number of replies'),
                    'replies'              => new external_multiple_structure($replystructure),
                ])
            ),
        ]);
    }
}
