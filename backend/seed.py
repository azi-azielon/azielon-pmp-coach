import json
from pathlib import Path
from sqlalchemy.orm import Session
from .models import Question, TopicNote, Diagram, TrickyWord

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'

def _read(name):
    return json.loads((DATA/name).read_text(encoding='utf-8'))

def seed_all(db: Session):
    if db.query(Question).count() == 0:
        src = _read('questions_source.json')
        for q in src.get('items', []):
            eco = q.get('ecoMapping') or {}
            db.add(Question(
                id=q['id'], stem=q.get('stem',''), options_json=json.dumps(q.get('options',[])),
                answer_json=json.dumps(q.get('answer',{})), explanation_json=json.dumps(q.get('explanation',{})),
                type=q.get('type') or 'single', domain=eco.get('domain') or q.get('provisionalDomain'),
                eco_task=eco.get('taskCode') or eco.get('task'), eco_enabler=eco.get('enabler'),
                delivery_approach=q.get('deliveryApproach'), difficulty=q.get('difficulty'),
                primary_concept=q.get('primaryConcept'), curriculum_links_json=json.dumps(q.get('curriculumLinks',[])),
                visual_json=json.dumps(q.get('visual')), review_status=q.get('reviewStatus') or q.get('status') or 'Instructor Approved',
                lifecycle_state=q.get('lifecycleState') or 'Published', instructor_approved=bool(q.get('instructorApproval', True)),
                source_metadata_json=json.dumps(q.get('sourceMetadata',{})), version=int(q.get('version',1) or 1)
            ))
    if db.query(TopicNote).count() == 0:
        src = _read('topic_notes_source.json')
        for t in src.get('topics',[]):
            db.add(TopicNote(id=t['id'], domain=t.get('domain'), title=t.get('title'), body_json=json.dumps(t)))
    # Upsert any packaged diagram entries that are missing from an existing database.
    # Existing instructor-edited diagram records are preserved; only missing IDs are inserted.
    src = _read('diagram_library_source.json')
    image_map = {
            'PD-001':'maslow_s_hierarchy_study_guide.png',
            'PD-002':'tuckman_team_development_ladder.png',
            'PD-003':'stakeholder_power_interest_grid_infographic.png',
            'PD-004':'stakeholder_engagement_assessment_matrix.png',
            'PD-005':'conflict_resolution_modes_map.png',
            'PD-006':'power_types_map_infographic.png',
            'PD-007':'raci_responsibility_assignment_matrix.png',
            'PD-008':'communication_channels_growth_diagram.png',
            'PD-009':'scrum_roles_and_sprint_flow_infographic.png',
            'PRD-001':'context_diagram_scope_and_interfaces.png',
            'PRD-002':'fishbone_diagram_root_cause_analysis.png',
            'PRD-003':'pareto_chart_quality_prioritization.png',
            'PRD-004':'control_chart_quality_guide.png',
            'PRD-005':'histogram_quality_data_distribution.png',
            'PRD-006':'scatter_diagram_finding_positive_correlation.png',
            'PRD-007':'probability_impact_risk_matrix.png',
            'PRD-008':'tornado_diagram_sensitivity_study_card.png',
            'PRD-009':'decision_tree_options_uncertainty_and_value.png',
            'PRD-010':'network_diagram_critical_path_infographic.png',
            'PRD-011':'agile_burndown_chart_cheat_sheet.png',
            'PRD-012':'burnup_chart_progress_and_scope.png',
            'PRD-013':'cumulative_flow_diagram_study_guide.png',
            'PRD-014':'kanban_board_study_guide.png',
            'PRD-015':'change_control_flow_infographic.png',
            'PRD-016':'risk_to_issue_flow_infographic.png',
            'PRD-017':'project_documents_map_infographic.png',
            'BED-001':'from_business_need_to_strategic_value.png',
            'BED-002':'governance_escalation_path_infographic.png',
            'BED-003':'organizational_change_adoption_flow.png',
            'BED-004':'compliance_decision_flow_infographic.png',
            'BED-005':'finance_formula_family_map.png',
            'BED-006':'ai_decision_support_flow_infographic.png',
            'BED-007':'sustainability_triple_bottom_line_guide.png',
            'BED-008':'project_management_work_structure_map.png',
    }
    for d in src.get('items',[]):
        if db.get(Diagram,d['id']):
            continue
        image = d.get('imageFile') or f"assets/diagrams/{image_map.get(d['id'], _slug(d.get('title','diagram'))+'.png')}"
        db.add(Diagram(id=d['id'], domain=d.get('domain'), title=d.get('title'), category=d.get('category'), image_file=image, metadata_json=json.dumps(d)))
    if db.query(TrickyWord).count() == 0:
        src = _read('tricky_words_source.json')
        for t in src:
            db.add(TrickyWord(id=t['id'], left_term=t.get('left'), right_term=t.get('right'), tags_json=json.dumps(t.get('tags',[])), body_json=json.dumps(t)))
    db.commit()

def _slug(s):
    import re
    return re.sub(r'[^a-z0-9]+','_',s.lower()).strip('_')
