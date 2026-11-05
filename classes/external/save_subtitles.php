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
use mod_smartvideo\vtt_helper;

/**
 * External web service to save or update WebVTT subtitle track.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_subtitles extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'    => new external_value(PARAM_INT, 'Course module ID'),
            'lang'    => new external_value(PARAM_ALPHA, 'Language code (e.g. en, ar)', VALUE_DEFAULT, 'en'),
            'label'   => new external_value(PARAM_TEXT, 'Display label (e.g. English, Arabic)', VALUE_DEFAULT, 'English'),
            'content' => new external_value(PARAM_RAW, 'Raw WebVTT content'),
        ]);
    }

    /**
     * Execute save subtitles.
     *
     * @param int $cmid Course module ID.
     * @param string $lang Language code.
     * @param string $label Display label.
     * @param string $content WebVTT content.
     * @return array
     */
    public static function execute(int $cmid, string $lang = 'en', string $label = 'English', string $content = ''): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'    => $cmid,
            'lang'    => $lang,
            'label'   => $label,
            'content' => $content,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('moodle/course:manageactivities', $context);

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $lang = strtolower(trim($params['lang']));
        if (empty($lang)) {
            $lang = 'en';
        }
        $label = trim($params['label']);
        if (empty($label)) {
            $label = ucfirst($lang);
        }
        $content = trim($params['content']);
        if (empty($content)) {
            throw new \invalid_parameter_exception('Subtitle content cannot be empty.');
        }

        $now = time();
        $existing = $DB->get_record('smartvideo_subtitles', [
            'instanceid' => $smartvideo->id,
            'lang'       => $lang,
        ]);

        $record = new stdClass();
        $record->instanceid   = $smartvideo->id;
        $record->lang         = $lang;
        $record->label        = $label;
        $record->content      = $content;
        $record->timemodified = $now;

        if ($existing) {
            $record->id = $existing->id;
            $DB->update_record('smartvideo_subtitles', $record);
            $id = $existing->id;
        } else {
            $record->timecreated = $now;
            $id = $DB->insert_record('smartvideo_subtitles', $record);
        }

        $cues = vtt_helper::parse_vtt($content);

        return [
            'status'   => true,
            'id'       => (int)$id,
            'cuecount' => count($cues),
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status'   => new external_value(PARAM_BOOL, 'Operation success status'),
            'id'       => new external_value(PARAM_INT, 'Subtitle track ID'),
            'cuecount' => new external_value(PARAM_INT, 'Number of parsed cues'),
        ]);
    }
}
