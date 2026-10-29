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

namespace mod_securevideo\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_module;
use mod_securevideo\question_helper;

/**
 * External web service to submit student answers to in-video interactive questions.
 *
 * @package    mod_securevideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class submit_question_attempt extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'         => new external_value(PARAM_INT, 'Course module ID'),
            'svquestionid' => new external_value(PARAM_INT, 'Interactive question cuepoint ID'),
            'formdata'     => new external_value(PARAM_RAW, 'JSON encoded or urlencoded question form input key-values'),
        ]);
    }

    /**
     * Execute submission.
     *
     * @param int $cmid Course module ID.
     * @param int $svquestionid Cuepoint ID.
     * @param string $formdata Form data string.
     * @return array
     */
    public static function execute(int $cmid, int $svquestionid, string $formdata): array {
        global $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'         => $cmid,
            'svquestionid' => $svquestionid,
            'formdata'     => $formdata,
        ]);

        $cm = get_coursemodule_from_id('securevideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('mod/securevideo:view', $context);

        // Decode JSON or parse URL-encoded query string.
        $postdata = [];
        $decoded = json_decode($params['formdata'], true);
        if (is_array($decoded)) {
            $postdata = $decoded;
        } else {
            parse_str($params['formdata'], $postdata);
        }

        $result = question_helper::process_submission(
            $params['cmid'],
            $params['svquestionid'],
            (int)$USER->id,
            $postdata
        );

        return array_merge(['status' => true], $result);
    }

    /**
     * Returns structure.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status'         => new external_value(PARAM_BOOL, 'Status of operation'),
            'is_correct'     => new external_value(PARAM_BOOL, 'Whether answer is fully correct'),
            'fraction'       => new external_value(PARAM_FLOAT, 'Score fraction (0.0 to 1.0)'),
            'passed'         => new external_value(PARAM_BOOL, 'Whether student has passed this question'),
            'can_continue'   => new external_value(PARAM_BOOL, 'Whether video playback can resume'),
            'rewind_seconds' => new external_value(PARAM_INT, 'Number of seconds to rewind if failed'),
            'rewind_to'      => new external_value(PARAM_INT, 'Target timestamp to rewind to, or -1 if no rewind', VALUE_DEFAULT, -1),
            'feedback_html'  => new external_value(PARAM_RAW, 'Rendered question feedback HTML'),
        ]);
    }
}
