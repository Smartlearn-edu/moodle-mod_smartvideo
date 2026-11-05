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

namespace mod_smartvideo;

use context_course;
use context_module;
use question_bank;
use question_engine;
use question_display_options;

/**
 * Question helper managing Question Bank discovery and Question Engine attempts for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class question_helper {
    /**
     * Get all question categories in the course (including Moodle 5.0+ mod_qbank module contexts).
     *
     * @param int $courseid The course ID.
     * @return array Array of category objects with id, name, contextname, count.
     */
    public static function get_course_question_categories(int $courseid): array {
        global $DB;

        $coursecontext = context_course::instance($courseid);
        $contextids = $coursecontext->get_parent_context_ids(true);

        // Include module contexts in this course (mod_qbank, mod_quiz, etc.).
        $modulecontextids = $DB->get_fieldset_sql(
            "SELECT ctx.id
               FROM {course_modules} cm
               JOIN {context} ctx ON ctx.instanceid = cm.id AND ctx.contextlevel = :contextlevel
              WHERE cm.course = :courseid",
            ['contextlevel' => CONTEXT_MODULE, 'courseid' => $courseid]
        );

        if (!empty($modulecontextids)) {
            $contextids = array_merge($contextids, $modulecontextids);
        }

        if (empty($contextids)) {
            return [];
        }

        [$insql, $params] = $DB->get_in_or_equal($contextids, SQL_PARAMS_NAMED);
        $params['status'] = 'ready';

        $sql = "SELECT qc.id, qc.name, qc.contextid, COUNT(q.id) AS questioncount
                  FROM {question_categories} qc
                  JOIN {question_bank_entries} qbe ON qbe.questioncategoryid = qc.id
                  JOIN {question_versions} qv ON qv.questionbankentryid = qbe.id AND qv.version = (
                        SELECT MAX(qv2.version)
                          FROM {question_versions} qv2
                         WHERE qv2.questionbankentryid = qbe.id AND qv2.status = :status
                  )
                  JOIN {question} q ON q.id = qv.questionid
                 WHERE qc.contextid $insql
              GROUP BY qc.id, qc.name, qc.contextid
                HAVING COUNT(q.id) > 0
              ORDER BY qc.name ASC";

        $records = $DB->get_records_sql($sql, $params);
        $categories = [];

        foreach ($records as $cat) {
            $context = \context::instance_by_id($cat->contextid, IGNORE_MISSING);
            $contextname = $context ? $context->get_context_name(false, true) : '';

            $categories[] = [
                'id'          => (int)$cat->id,
                'name'        => format_string($cat->name),
                'contextname' => $contextname,
                'count'       => (int)$cat->questioncount,
                'displayname' => format_string($cat->name) . ' (' . $cat->questioncount . ') - ' . $contextname,
            ];
        }

        return $categories;
    }

    /**
     * Get all ready questions in a specific category.
     *
     * @param int $categoryid The question category ID.
     * @return array Array of questions with id, questionbankentryid, name, qtype, preview.
     */
    public static function get_category_questions(int $categoryid): array {
        global $DB;

        $sql = "SELECT q.id, q.name, q.qtype, q.questiontext, q.questiontextformat,
                       qbe.id AS questionbankentryid, qv.version
                  FROM {question_bank_entries} qbe
                  JOIN {question_versions} qv ON qv.questionbankentryid = qbe.id AND qv.version = (
                        SELECT MAX(qv2.version)
                          FROM {question_versions} qv2
                         WHERE qv2.questionbankentryid = qbe.id AND qv2.status = :status
                  )
                  JOIN {question} q ON q.id = qv.questionid
                 WHERE qbe.questioncategoryid = :categoryid
              ORDER BY q.name ASC";

        $records = $DB->get_records_sql($sql, ['status' => 'ready', 'categoryid' => $categoryid]);
        $questions = [];

        foreach ($records as $q) {
            $plain = html_to_text(format_text($q->questiontext, $q->questiontextformat));
            $plain = preg_replace('/\s+/', ' ', trim($plain));
            if (mb_strlen($plain) > 120) {
                $plain = mb_substr($plain, 0, 117) . '...';
            }

            $questions[] = [
                'id'                  => (int)$q->id,
                'questionbankentryid' => (int)$q->questionbankentryid,
                'version'             => (int)$q->version,
                'name'                => format_string($q->name),
                'qtype'               => $q->qtype,
                'preview'             => $plain,
            ];
        }

        return $questions;
    }

    /**
     * Resolve the latest ready question ID for a given question bank entry.
     *
     * @param int $qbeid Question bank entry ID.
     * @param int $fallbackqid Fallback question ID if entry has no versions.
     * @return int Latest question ID.
     */
    public static function get_latest_question_id(int $qbeid, int $fallbackqid): int {
        global $DB;

        if ($qbeid <= 0) {
            return $fallbackqid;
        }

        $qid = $DB->get_field_sql(
            "SELECT qv.questionid
               FROM {question_versions} qv
              WHERE qv.questionbankentryid = :qbeid AND qv.status = :status
           ORDER BY qv.version DESC",
            ['qbeid' => $qbeid, 'status' => 'ready'],
            IGNORE_MULTIPLE
        );

        return $qid ? (int)$qid : $fallbackqid;
    }

    /**
     * Load or start a question attempt for the student at a specific cuepoint.
     *
     * @param int $cmid Course module ID.
     * @param int $svquestionid Interactive question cuepoint ID.
     * @param int $userid Student user ID.
     * @param bool $forcenew True to start a fresh attempt (e.g. after a fail and retry).
     * @return array Attempt details with rendered HTML and JS.
     */
    public static function get_or_create_attempt(
        int $cmid,
        int $svquestionid,
        int $userid,
        bool $forcenew = false
    ): array {
        global $DB, $PAGE;

        $cm = get_coursemodule_from_id('smartvideo', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        $cue = $DB->get_record('smartvideo_questions', ['id' => $svquestionid], '*', MUST_EXIST);

        $attempt = $DB->get_record('smartvideo_qattempts', [
            'svquestionid' => $cue->id,
            'userid'       => $userid,
        ]);

        $quba = null;
        $slot = 1;

        if ($attempt && !$forcenew) {
            try {
                $quba = question_engine::load_questions_usage_by_activity($attempt->qubaid);
                $slot = $attempt->slot;

                // If question is finished and not passed, start fresh attempt.
                if ($quba->get_question_state($slot)->is_finished() && empty($attempt->passed)) {
                    $forcenew = true;
                }
            } catch (\Exception $e) {
                $forcenew = true;
            }
        }

        if (!$attempt || $forcenew) {
            $latestqid = self::get_latest_question_id((int)$cue->questionbankentryid, (int)$cue->questionid);
            if ($latestqid <= 0) {
                throw new \moodle_exception('invalidquestion', 'mod_smartvideo');
            }
            if ($cue->questionid <= 0) {
                $DB->set_field('smartvideo_questions', 'questionid', $latestqid, ['id' => $cue->id]);
            }
            $question = question_bank::load_question($latestqid);

            $quba = question_engine::make_questions_usage_by_activity('mod_smartvideo', $context);
            $quba->set_preferred_behaviour('immediatefeedback');
            $slot = $quba->add_question($question, 1.0);
            $quba->start_question($slot);

            $transaction = $DB->start_delegated_transaction();
            question_engine::save_questions_usage_by_activity($quba);

            $now = time();
            if ($attempt) {
                $attempt->qubaid = $quba->get_id();
                $attempt->slot = $slot;
                $attempt->timemodified = $now;
                $DB->update_record('smartvideo_qattempts', $attempt);
            } else {
                $attempt = (object)[
                    'instanceid'   => $cue->instanceid,
                    'svquestionid' => $cue->id,
                    'userid'       => $userid,
                    'qubaid'       => $quba->get_id(),
                    'slot'         => $slot,
                    'passed'       => 0,
                    'attempts'     => 0,
                    'fraction'     => null,
                    'timemodified' => $now,
                ];
                $attempt->id = $DB->insert_record('smartvideo_qattempts', $attempt);
            }
            $transaction->allow_commit();
        }

        $displayoptions = new question_display_options();
        $displayoptions->readonly = false;
        $displayoptions->flags = question_display_options::HIDDEN;
        $displayoptions->marks = question_display_options::HIDDEN;
        $displayoptions->feedback = question_display_options::VISIBLE;
        $displayoptions->correctness = question_display_options::VISIBLE;
        $displayoptions->rightanswer = question_display_options::HIDDEN;

        // Render head HTML and main question HTML.
        $quba->render_question_head_html($slot);
        $html = $quba->render_question($slot, $displayoptions);

        return [
            'svquestionid'   => (int)$cue->id,
            'title'          => !empty($cue->title) ? format_string($cue->title) : get_string('knowledgecheck', 'mod_smartvideo'),
            'timecode'       => (int)$cue->timecode,
            'requirecorrect' => (int)$cue->requirecorrect,
            'rewindonfail'   => (int)$cue->rewindonfail,
            'rewindto'       => isset($cue->rewindto) ? (int)$cue->rewindto : -1,
            'questionstyle'  => !empty($cue->questionstyle) ? $cue->questionstyle : 'compact',
            'qubaid'         => (int)$quba->get_id(),
            'slot'           => (int)$slot,
            'passed'         => !empty($attempt->passed),
            'html'           => $html,
        ];
    }

    /**
     * Grade and process a student's answer submission for a cuepoint.
     *
     * @param int $cmid Course module ID.
     * @param int $svquestionid Cuepoint ID.
     * @param int $userid Student user ID.
     * @param array $postdata Submitted form input key-values.
     * @return array Evaluation result with pass status, score, and feedback HTML.
     */
    public static function process_submission(
        int $cmid,
        int $svquestionid,
        int $userid,
        array $postdata
    ): array {
        global $DB;

        $cm = get_coursemodule_from_id('smartvideo', $cmid, 0, false, MUST_EXIST);
        $cue = $DB->get_record('smartvideo_questions', ['id' => $svquestionid], '*', MUST_EXIST);
        $attempt = $DB->get_record('smartvideo_qattempts', [
            'svquestionid' => $cue->id,
            'userid'       => $userid,
        ], '*', MUST_EXIST);

        $quba = question_engine::load_questions_usage_by_activity($attempt->qubaid);
        $slot = $attempt->slot;

        // In immediatefeedback behaviour, ensure the -submit key is passed to trigger grading.
        $submitprefix = 'q' . $attempt->qubaid . ':' . $slot . '_';
        if (!isset($postdata[$submitprefix . '-submit'])) {
            $postdata[$submitprefix . '-submit'] = '1';
        }

        $transaction = $DB->start_delegated_transaction();
        $quba->process_all_actions(null, $postdata);
        question_engine::save_questions_usage_by_activity($quba);

        $fraction = $quba->get_question_fraction($slot);
        $iscorrect = ($fraction !== null && $fraction >= 0.999);

        $attempt->attempts = (int)$attempt->attempts + 1;
        $attempt->fraction = $fraction;
        if ($iscorrect) {
            $attempt->passed = 1;
        }
        $attempt->timemodified = time();
        $DB->update_record('smartvideo_qattempts', $attempt);
        $transaction->allow_commit();

        // Update activity completion if passed and completion is enabled.
        if ($iscorrect) {
            $course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
            $completion = new \completion_info($course);
            if ($completion->is_enabled($cm)) {
                $completion->update_state($cm, COMPLETION_COMPLETE, $userid);
            }
        }

        // Render graded feedback.
        $displayoptions = new question_display_options();
        $displayoptions->readonly = true;
        $displayoptions->flags = question_display_options::HIDDEN;
        $displayoptions->marks = question_display_options::HIDDEN;
        $displayoptions->feedback = question_display_options::VISIBLE;
        $displayoptions->correctness = question_display_options::VISIBLE;
        $displayoptions->generalfeedback = question_display_options::VISIBLE;
        $displayoptions->rightanswer = question_display_options::VISIBLE;

        $feedbackhtml = $quba->render_question($slot, $displayoptions);

        $rewindto = -1;
        if (!$iscorrect) {
            if (isset($cue->rewindto) && (int)$cue->rewindto >= 0) {
                $rewindto = (int)$cue->rewindto;
            } else if (!empty($cue->rewindonfail)) {
                $rewindto = max(0, (int)$cue->timecode - (int)$cue->rewindonfail);
            }
        }

        return [
            'is_correct'     => (bool)$iscorrect,
            'fraction'       => (float)($fraction ?? 0),
            'passed'         => !empty($attempt->passed),
            'can_continue'   => $iscorrect || empty($cue->requirecorrect),
            'rewind_seconds' => (!$iscorrect && !empty($cue->rewindonfail)) ? (int)$cue->rewindonfail : 0,
            'rewind_to'      => $rewindto,
            'feedback_html'  => $feedbackhtml,
        ];
    }

    /**
     * Rapidly creates a Multiple Choice or True/False question in the course Question Bank
     * and returns the created question ID and bank entry ID.
     *
     * @param int $courseid Course ID.
     * @param int $categoryid Category ID (0 to use default course category).
     * @param string $qtype Question type ('multichoice' or 'truefalse').
     * @param string $name Question title / name.
     * @param string $questiontext Question text prompt.
     * @param array $choices List of string choices (e.g. ['True', 'False'] or ['Option A', 'Option B']).
     * @param int $correctindex 0-based index of the correct choice.
     * @return array [questionid, questionbankentryid, categoryid, name]
     */
    public static function create_quick_question(
        int $courseid,
        int $categoryid,
        string $qtype,
        string $name,
        string $questiontext,
        array $choices,
        int $correctindex
    ): array {
        global $DB, $USER, $CFG;
        require_once($CFG->libdir . '/questionlib.php');

        $coursecontext = context_course::instance($courseid);

        if ($categoryid <= 0) {
            $defaultcat = question_get_default_category($coursecontext->id);
            if (!$defaultcat) {
                // Fallback: fetch first category in course context.
                $defaultcat = $DB->get_record('question_categories', ['contextid' => $coursecontext->id], '*', IGNORE_MULTIPLE);
            }
            if (!$defaultcat) {
                throw new \moodle_exception('cannotfindcategory', 'question');
            }
            $categoryid = (int)$defaultcat->id;
        }

        $now = time();
        $qtype = ($qtype === 'truefalse') ? 'truefalse' : 'multichoice';

        $transaction = $DB->start_delegated_transaction();

        // 1. Create question_bank_entries.
        $qbe = new \stdClass();
        $qbe->questioncategoryid = $categoryid;
        $qbe->idnumber = null;
        $qbe->ownerid = $USER->id;
        $qbeid = $DB->insert_record('question_bank_entries', $qbe);

        // 2. Create question record.
        $q = new \stdClass();
        $q->category = $categoryid;
        $q->name = trim($name);
        $q->questiontext = trim($questiontext);
        $q->questiontextformat = FORMAT_HTML;
        $q->generalfeedback = '';
        $q->generalfeedbackformat = FORMAT_HTML;
        $q->defaultmark = 1.0;
        $q->penalty = 0.3333333;
        $q->qtype = $qtype;
        $q->length = 1;
        $q->stamp = make_unique_id_code();
        $q->timecreated = $now;
        $q->timemodified = $now;
        $q->createdby = $USER->id;
        $q->modifiedby = $USER->id;
        $qid = $DB->insert_record('question', $q);

        // 3. Create question_versions.
        $qv = new \stdClass();
        $qv->questionbankentryid = $qbeid;
        $qv->version = 1;
        $qv->questionid = $qid;
        $qv->status = 'ready';
        $DB->insert_record('question_versions', $qv);

        // 4. Create choices and type-specific records.
        if ($qtype === 'multichoice') {
            $mc = new \stdClass();
            $mc->questionid = $qid;
            $mc->single = 1;
            $mc->shuffleanswers = 1;
            $mc->answernumbering = 'abc';
            $mc->showstandardinstruction = 0;
            $mc->correctfeedback = '';
            $mc->correctfeedbackformat = FORMAT_HTML;
            $mc->partiallycorrectfeedback = '';
            $mc->partiallycorrectfeedbackformat = FORMAT_HTML;
            $mc->incorrectfeedback = '';
            $mc->incorrectfeedbackformat = FORMAT_HTML;
            $DB->insert_record('qtype_multichoice_options', $mc);

            foreach ($choices as $idx => $choice) {
                $ans = new \stdClass();
                $ans->question = $qid;
                $ans->answer = trim($choice);
                $ans->answerformat = FORMAT_HTML;
                $ans->fraction = ($idx === $correctindex) ? 1.0 : 0.0;
                $ans->feedback = '';
                $ans->feedbackformat = FORMAT_HTML;
                $DB->insert_record('question_answers', $ans);
            }
        } else if ($qtype === 'truefalse') {
            // True/false has two answers: True (fraction=1 or 0), False (fraction=0 or 1).
            $trueans = new \stdClass();
            $trueans->question = $qid;
            $trueans->answer = get_string('true', 'qtype_truefalse');
            $trueans->answerformat = FORMAT_HTML;
            $trueans->fraction = ($correctindex === 0) ? 1.0 : 0.0;
            $trueans->feedback = '';
            $trueans->feedbackformat = FORMAT_HTML;
            $trueid = $DB->insert_record('question_answers', $trueans);

            $falseans = new \stdClass();
            $falseans->question = $qid;
            $falseans->answer = get_string('false', 'qtype_truefalse');
            $falseans->answerformat = FORMAT_HTML;
            $falseans->fraction = ($correctindex === 1) ? 1.0 : 0.0;
            $falseans->feedback = '';
            $falseans->feedbackformat = FORMAT_HTML;
            $falseid = $DB->insert_record('question_answers', $falseans);

            $tf = new \stdClass();
            $tf->questionid = $qid;
            $tf->trueanswerid = $trueid;
            $tf->falseanswerid = $falseid;
            $DB->insert_record('question_truefalse', $tf);
        }

        $transaction->allow_commit();

        return [
            'questionid'          => (int)$qid,
            'questionbankentryid' => (int)$qbeid,
            'categoryid'          => (int)$categoryid,
            'name'                => $q->name,
            'qtype'               => $qtype,
        ];
    }
}
