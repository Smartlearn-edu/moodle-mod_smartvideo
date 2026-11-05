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
use mod_smartvideo\question_helper;

/**
 * External web service to retrieve Question Bank categories for the course.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_course_categories extends external_api {
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
     * Execute function.
     *
     * @param int $cmid Course module ID.
     * @return array List of categories.
     */
    public static function execute(int $cmid): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        if (
            !has_capability('moodle/course:manageactivities', $context)
            && !has_capability('mod/smartvideo:addinstance', $context)
            && !has_capability('mod/smartvideo:managequestions', $context)
        ) {
            throw new \moodle_exception('nopermissions', 'error', '', 'manage questions');
        }

        return question_helper::get_course_question_categories((int)$cm->course);
    }

    /**
     * Returns structure.
     *
     * @return external_multiple_structure
     */
    public static function execute_returns(): external_multiple_structure {
        return new external_multiple_structure(
            new external_single_structure([
                'id'          => new external_value(PARAM_INT, 'Category ID'),
                'name'        => new external_value(PARAM_TEXT, 'Category Name'),
                'contextname' => new external_value(PARAM_TEXT, 'Context Name'),
                'count'       => new external_value(PARAM_INT, 'Number of questions'),
                'displayname' => new external_value(PARAM_TEXT, 'Formatted display name'),
            ])
        );
    }
}
