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
 * External web service to get or start a question attempt for in-video playback.
 *
 * @package    mod_securevideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_question_attempt extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'         => new external_value(PARAM_INT, 'Course module ID'),
            'svquestionid' => new external_value(PARAM_INT, 'Interactive question cuepoint ID'),
            'forcenew'     => new external_value(PARAM_BOOL, 'Start new attempt if failed', VALUE_DEFAULT, false),
        ]);
    }

    /**
     * Execute attempt load.
     *
     * @param int $cmid Course module ID.
     * @param int $svquestionid Cuepoint ID.
     * @param bool $forcenew Force new attempt.
     * @return array
     */
    public static function execute(int $cmid, int $svquestionid, bool $forcenew = false): array {
        global $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'         => $cmid,
            'svquestionid' => $svquestionid,
            'forcenew'     => $forcenew,
        ]);

        $cm = get_coursemodule_from_id('securevideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('mod/securevideo:view', $context);

        $attempt = question_helper::get_or_create_attempt(
            $params['cmid'],
            $params['svquestionid'],
            (int)$USER->id,
            $params['forcenew']
        );

        return array_merge(['status' => true], $attempt);
    }

    /**
     * Returns structure.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status'         => new external_value(PARAM_BOOL, 'Status of operation'),
            'svquestionid'   => new external_value(PARAM_INT, 'Cuepoint ID'),
            'title'          => new external_value(PARAM_TEXT, 'Cuepoint title'),
            'timecode'       => new external_value(PARAM_INT, 'Timecode in seconds'),
            'requirecorrect' => new external_value(PARAM_INT, 'Require correct to continue'),
            'rewindonfail'   => new external_value(PARAM_INT, 'Seconds to rewind on fail'),
            'rewindto'       => new external_value(PARAM_INT, 'Target timestamp to rewind to, -1 for retry in place', VALUE_DEFAULT, -1),
            'qubaid'         => new external_value(PARAM_INT, 'QUBA ID'),
            'slot'           => new external_value(PARAM_INT, 'Slot ID'),
            'passed'         => new external_value(PARAM_BOOL, 'Whether already passed'),
            'html'           => new external_value(PARAM_RAW, 'Rendered question HTML'),
        ]);
    }
}
