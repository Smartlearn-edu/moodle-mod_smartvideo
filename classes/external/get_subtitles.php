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
use mod_smartvideo\vtt_helper;

/**
 * External web service to fetch WebVTT subtitle tracks and parsed cues.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_subtitles extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module ID'),
            'lang' => new external_value(PARAM_ALPHA, 'Requested language code or empty for default', VALUE_DEFAULT, ''),
        ]);
    }

    /**
     * Execute get subtitles.
     *
     * @param int $cmid Course module ID.
     * @param string $lang Language code.
     * @return array
     */
    public static function execute(int $cmid, string $lang = ''): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'lang' => $lang,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/smartvideo:view', $context);

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $subtitles = $DB->get_records('smartvideo_subtitles', ['instanceid' => $smartvideo->id], 'id ASC');

        $tracks = [];
        $selectedTrack = null;

        foreach ($subtitles as $sub) {
            $tracks[] = [
                'id'    => (int)$sub->id,
                'lang'  => $sub->lang,
                'label' => $sub->label,
            ];
            if (!empty($params['lang']) && $sub->lang === $params['lang']) {
                $selectedTrack = $sub;
            }
        }

        if (!$selectedTrack && !empty($subtitles)) {
            $selectedTrack = reset($subtitles);
        }

        $cues = [];
        if ($selectedTrack && !empty($selectedTrack->content)) {
            $cues = vtt_helper::parse_vtt($selectedTrack->content);
        }

        return [
            'hastrack'     => !empty($selectedTrack),
            'selectedlang' => $selectedTrack ? $selectedTrack->lang : '',
            'label'        => $selectedTrack ? $selectedTrack->label : '',
            'tracks'       => $tracks,
            'cues'         => $cues,
            'hascues'      => !empty($cues),
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'hastrack'     => new external_value(PARAM_BOOL, 'Whether subtitle tracks exist'),
            'selectedlang' => new external_value(PARAM_TEXT, 'Active language code'),
            'label'        => new external_value(PARAM_TEXT, 'Active language label'),
            'tracks'       => new external_multiple_structure(
                new external_single_structure([
                    'id'    => new external_value(PARAM_INT, 'Subtitle track ID'),
                    'lang'  => new external_value(PARAM_TEXT, 'Language code'),
                    'label' => new external_value(PARAM_TEXT, 'Language display label'),
                ])
            ),
            'cues'         => new external_multiple_structure(
                new external_single_structure([
                    'start'          => new external_value(PARAM_FLOAT, 'Start time in seconds'),
                    'end'            => new external_value(PARAM_FLOAT, 'End time in seconds'),
                    'startformatted' => new external_value(PARAM_TEXT, 'Formatted start time (MM:SS)'),
                    'endformatted'   => new external_value(PARAM_TEXT, 'Formatted end time (MM:SS)'),
                    'text'           => new external_value(PARAM_RAW, 'Subtitle text'),
                ])
            ),
            'hascues'      => new external_value(PARAM_BOOL, 'Whether cues were parsed'),
        ]);
    }
}
