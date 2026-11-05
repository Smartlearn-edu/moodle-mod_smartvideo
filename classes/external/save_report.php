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
 * External web service to save or submit a structured student medical/case inspection report.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_report extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'            => new external_value(PARAM_INT, 'Course module ID'),
            'findings'        => new external_value(PARAM_RAW, 'Findings text', VALUE_DEFAULT, ''),
            'impression'      => new external_value(PARAM_RAW, 'Impression text', VALUE_DEFAULT, ''),
            'diagnosis'       => new external_value(PARAM_RAW, 'Diagnosis text', VALUE_DEFAULT, ''),
            'recommendations' => new external_value(PARAM_RAW, 'Recommendations text', VALUE_DEFAULT, ''),
            'status'          => new external_value(PARAM_ALPHA, 'Status: draft or submitted', VALUE_DEFAULT, 'draft'),
        ]);
    }

    /**
     * Execute save report.
     *
     * @param int $cmid Course module ID.
     * @param string $findings Findings.
     * @param string $impression Impression.
     * @param string $diagnosis Diagnosis.
     * @param string $recommendations Recommendations.
     * @param string $status Status.
     * @return array
     */
    public static function execute(
        int $cmid,
        string $findings = '',
        string $impression = '',
        string $diagnosis = '',
        string $recommendations = '',
        string $status = 'draft'
    ): array {
        global $DB, $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'            => $cmid,
            'findings'        => $findings,
            'impression'      => $impression,
            'diagnosis'       => $diagnosis,
            'recommendations' => $recommendations,
            'status'          => $status,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/smartvideo:view', $context);

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $statusVal = ($params['status'] === 'submitted') ? 'submitted' : 'draft';
        $now = time();

        $existing = $DB->get_record('smartvideo_reports', [
            'instanceid' => $smartvideo->id,
            'userid'     => $USER->id,
        ]);

        $record = new stdClass();
        $record->instanceid      = $smartvideo->id;
        $record->userid          = $USER->id;
        $record->findings        = trim($params['findings']);
        $record->impression      = trim($params['impression']);
        $record->diagnosis       = trim($params['diagnosis']);
        $record->recommendations = trim($params['recommendations']);
        $record->status          = $statusVal;
        $record->timemodified    = $now;

        if ($existing) {
            $record->id = $existing->id;
            $DB->update_record('smartvideo_reports', $record);
            $id = $existing->id;
        } else {
            $record->timecreated = $now;
            $id = $DB->insert_record('smartvideo_reports', $record);
        }

        return [
            'status'       => true,
            'id'           => (int)$id,
            'reportstatus' => $statusVal,
            'timemodified' => (int)$now,
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status'       => new external_value(PARAM_BOOL, 'Operation success status'),
            'id'           => new external_value(PARAM_INT, 'Report ID'),
            'reportstatus' => new external_value(PARAM_ALPHA, 'Status of report'),
            'timemodified' => new external_value(PARAM_INT, 'Last modified timestamp'),
        ]);
    }
}
