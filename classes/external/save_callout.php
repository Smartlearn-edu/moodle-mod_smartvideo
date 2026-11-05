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
 * External web service to create or update an in-video callout card.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_callout extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'      => new external_value(PARAM_INT, 'Course module ID'),
            'calloutid' => new external_value(PARAM_INT, 'Callout ID (0 to create)', VALUE_DEFAULT, 0),
            'timecode'  => new external_value(PARAM_INT, 'Trigger time in seconds'),
            'duration'  => new external_value(PARAM_INT, 'Display duration in seconds', VALUE_DEFAULT, 8),
            'title'     => new external_value(PARAM_TEXT, 'Card title / heading'),
            'body'      => new external_value(PARAM_RAW, 'Card body text / markdown', VALUE_DEFAULT, ''),
            'linkurl'   => new external_value(PARAM_RAW, 'Optional button action URL', VALUE_DEFAULT, ''),
            'linklabel' => new external_value(PARAM_TEXT, 'Button action label', VALUE_DEFAULT, ''),
            'autopause' => new external_value(PARAM_INT, '1 = auto-pause video on appearance', VALUE_DEFAULT, 0),
            'position'  => new external_value(PARAM_ALPHAEXT, 'Card position (bottom-right, top-right, bottom-left, top-left)', VALUE_DEFAULT, 'bottom-right'),
        ]);
    }

    /**
     * Execute save callout.
     *
     * @param int $cmid Course module ID.
     * @param int $calloutid Existing callout ID or 0.
     * @param int $timecode Trigger time in seconds.
     * @param int $duration Duration in seconds.
     * @param string $title Card title.
     * @param string $body Card body.
     * @param string $linkurl Link URL.
     * @param string $linklabel Link label.
     * @param int $autopause Auto-pause toggle.
     * @param string $position Card position.
     * @return array
     */
    public static function execute(
        int $cmid,
        int $calloutid,
        int $timecode,
        int $duration,
        string $title,
        string $body = '',
        string $linkurl = '',
        string $linklabel = '',
        int $autopause = 0,
        string $position = 'bottom-right'
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'      => $cmid,
            'calloutid' => $calloutid,
            'timecode'  => $timecode,
            'duration'  => $duration,
            'title'     => $title,
            'body'      => $body,
            'linkurl'   => $linkurl,
            'linklabel' => $linklabel,
            'autopause' => $autopause,
            'position'  => $position,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('moodle/course:manageactivities', $context);

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $title = trim($params['title']);
        if (empty($title)) {
            throw new \invalid_parameter_exception('Callout title cannot be empty.');
        }

        $now = time();
        $record = new stdClass();
        $record->instanceid   = $smartvideo->id;
        $record->timecode     = max(0, $params['timecode']);
        $record->duration     = max(2, min(300, $params['duration']));
        $record->title        = $title;
        $record->body         = clean_text($params['body'], FORMAT_HTML);
        $record->linkurl      = clean_param($params['linkurl'], PARAM_URL);
        $record->linklabel    = trim($params['linklabel']);
        $record->autopause    = !empty($params['autopause']) ? 1 : 0;
        $record->position     = in_array($params['position'], ['bottom-right', 'top-right', 'bottom-left', 'top-left', 'lower-third'])
            ? $params['position'] : 'bottom-right';
        $record->timemodified = $now;

        if (!empty($params['calloutid'])) {
            $existing = $DB->get_record('smartvideo_callouts', [
                'id'         => $params['calloutid'],
                'instanceid' => $smartvideo->id,
            ], '*', MUST_EXIST);
            $record->id = $existing->id;
            $DB->update_record('smartvideo_callouts', $record);
            $id = $existing->id;
        } else {
            $record->timecreated = $now;
            $id = $DB->insert_record('smartvideo_callouts', $record);
        }

        $mins = floor($record->timecode / 60);
        $secs = $record->timecode % 60;
        $timeformatted = sprintf('%02d:%02d', $mins, $secs);

        return [
            'success'       => true,
            'id'            => (int)$id,
            'timecode'      => (int)$record->timecode,
            'timeformatted' => $timeformatted,
            'duration'      => (int)$record->duration,
            'title'         => $record->title,
            'body'          => $record->body,
            'linkurl'       => $record->linkurl ?? '',
            'linklabel'     => $record->linklabel ?? '',
            'autopause'     => (int)$record->autopause,
            'position'      => $record->position,
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'success'       => new external_value(PARAM_BOOL, 'True on success'),
            'id'            => new external_value(PARAM_INT, 'Callout ID'),
            'timecode'      => new external_value(PARAM_INT, 'Timecode in seconds'),
            'timeformatted' => new external_value(PARAM_TEXT, 'Formatted time (MM:SS)'),
            'duration'      => new external_value(PARAM_INT, 'Display duration in seconds'),
            'title'         => new external_value(PARAM_TEXT, 'Callout title'),
            'body'          => new external_value(PARAM_RAW, 'Callout body text'),
            'linkurl'       => new external_value(PARAM_RAW, 'Link action URL'),
            'linklabel'     => new external_value(PARAM_TEXT, 'Link action button text'),
            'autopause'     => new external_value(PARAM_INT, 'Auto-pause 1 or 0'),
            'position'      => new external_value(PARAM_ALPHAEXT, 'Position on screen'),
        ]);
    }
}
