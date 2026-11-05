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
use stdClass;

/**
 * External web service to rapidly create a Multiple Choice or True/False question
 * in Question Bank and link it as an in-video question cuepoint.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class create_quick_question extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'           => new external_value(PARAM_INT, 'Course module ID'),
            'categoryid'     => new external_value(PARAM_INT, 'Question category ID (0 for course default)', VALUE_DEFAULT, 0),
            'timecode'       => new external_value(PARAM_INT, 'Timeline trigger in seconds'),
            'qtype'          => new external_value(PARAM_ALPHA, 'Question type (multichoice or truefalse)', VALUE_DEFAULT, 'multichoice'),
            'title'          => new external_value(PARAM_TEXT, 'Question display title / cuepoint label'),
            'questiontext'   => new external_value(PARAM_RAW, 'Question prompt text'),
            'choices'        => new external_multiple_structure(new external_value(PARAM_TEXT, 'Choice text'), 'Answer choices list'),
            'correctindex'   => new external_value(PARAM_INT, '0-based index of the correct choice', VALUE_DEFAULT, 0),
            'requirecorrect' => new external_value(PARAM_INT, '1 = require correct answer', VALUE_DEFAULT, 1),
            'rewindonfail'   => new external_value(PARAM_INT, 'Seconds to rewind on failure', VALUE_DEFAULT, 0),
            'rewindto'       => new external_value(PARAM_INT, 'Target timestamp to rewind to on failure, -1 for retry in place', VALUE_DEFAULT, -1),
            'questionstyle'  => new external_value(PARAM_ALPHA, 'Display style: compact or native', VALUE_DEFAULT, 'compact'),
        ]);
    }

    /**
     * Execute quick question creation and linking.
     *
     * @param int $cmid Course module ID.
     * @param int $categoryid Category ID.
     * @param int $timecode Timeline second.
     * @param string $qtype multichoice or truefalse.
     * @param string $title Title.
     * @param string $questiontext Question text.
     * @param array $choices Choices array.
     * @param int $correctindex Correct choice index.
     * @param int $requirecorrect Require correct toggle.
     * @param int $rewindonfail Rewind seconds.
     * @param int $rewindto Rewind target.
     * @param string $questionstyle compact or native.
     * @return array
     */
    public static function execute(
        int $cmid,
        int $categoryid,
        int $timecode,
        string $qtype,
        string $title,
        string $questiontext,
        array $choices,
        int $correctindex = 0,
        int $requirecorrect = 1,
        int $rewindonfail = 0,
        int $rewindto = -1,
        string $questionstyle = 'compact'
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'           => $cmid,
            'categoryid'     => $categoryid,
            'timecode'       => $timecode,
            'qtype'          => $qtype,
            'title'          => $title,
            'questiontext'   => $questiontext,
            'choices'        => $choices,
            'correctindex'   => $correctindex,
            'requirecorrect' => $requirecorrect,
            'rewindonfail'   => $rewindonfail,
            'rewindto'       => $rewindto,
            'questionstyle'  => $questionstyle,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('moodle/course:manageactivities', $context);
        require_capability('moodle/question:add', $context);

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $title = trim($params['title']);
        if (empty($title)) {
            $title = 'Question at ' . sprintf('%02d:%02d', floor($params['timecode'] / 60), $params['timecode'] % 60);
        }

        // 1. Create Question in Question Bank.
        $created = question_helper::create_quick_question(
            (int)$cm->course,
            (int)$params['categoryid'],
            $params['qtype'],
            $title,
            $params['questiontext'],
            $params['choices'],
            (int)$params['correctindex']
        );

        // 2. Link as cuepoint in smartvideo_questions.
        $now = time();
        $cue = new stdClass();
        $cue->instanceid          = $smartvideo->id;
        $cue->questionbankentryid = $created['questionbankentryid'];
        $cue->questionid          = $created['questionid'];
        $cue->timecode            = max(0, (int)$params['timecode']);
        $cue->title               = $title;
        $cue->requirecorrect      = !empty($params['requirecorrect']) ? 1 : 0;
        $cue->rewindonfail        = max(0, (int)$params['rewindonfail']);
        $cue->rewindto            = (int)$params['rewindto'];
        $cue->questionstyle       = in_array($params['questionstyle'], ['compact', 'native']) ? $params['questionstyle'] : 'compact';
        $cue->timecreated         = $now;
        $cue->timemodified        = $now;

        $cueid = $DB->insert_record('smartvideo_questions', $cue);

        $mins = floor($cue->timecode / 60);
        $secs = $cue->timecode % 60;
        $timeformatted = sprintf('%02d:%02d', $mins, $secs);

        return [
            'status'              => true,
            'success'             => true,
            'id'                  => (int)$cueid,
            'questionid'          => (int)$created['questionid'],
            'questionbankentryid' => (int)$created['questionbankentryid'],
            'timecode'            => (int)$cue->timecode,
            'timeformatted'       => $timeformatted,
            'title'               => $cue->title,
            'questionname'        => $created['name'],
            'qtype'               => $created['qtype'],
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status'              => new external_value(PARAM_BOOL, 'True on success', VALUE_DEFAULT, true),
            'success'             => new external_value(PARAM_BOOL, 'True on success', VALUE_DEFAULT, true),
            'id'                  => new external_value(PARAM_INT, 'Cuepoint ID'),
            'questionid'          => new external_value(PARAM_INT, 'Question ID'),
            'questionbankentryid' => new external_value(PARAM_INT, 'Question Bank Entry ID'),
            'timecode'            => new external_value(PARAM_INT, 'Timecode in seconds'),
            'timeformatted'       => new external_value(PARAM_TEXT, 'Formatted time (MM:SS)'),
            'title'               => new external_value(PARAM_TEXT, 'Title'),
            'questionname'        => new external_value(PARAM_TEXT, 'Question name'),
            'qtype'               => new external_value(PARAM_ALPHA, 'Question type'),
        ]);
    }
}
