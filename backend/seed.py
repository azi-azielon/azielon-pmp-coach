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
    # Additional questions for thin exam-outline tasks: insert only the ids that are missing, as unapproved drafts.
    try:
        extra=_read('questions_extra.json').get('items',[])
    except Exception:
        extra=[]
    for q in extra:
        if db.get(Question,q['id']):
            continue
        eco=q.get('ecoMapping') or {}
        db.add(Question(
            id=q['id'], stem=q.get('stem',''), options_json=json.dumps(q.get('options',[])),
            answer_json=json.dumps(q.get('answer',{})), explanation_json=json.dumps(q.get('explanation',{})),
            type=q.get('type') or 'single', domain=eco.get('domain') or q.get('provisionalDomain'),
            eco_task=eco.get('taskCode'), eco_enabler=eco.get('enablerText'),
            delivery_approach=q.get('deliveryApproach'), difficulty=q.get('difficulty'),
            primary_concept=q.get('primaryConcept'), curriculum_links_json=json.dumps([]),
            visual_json=json.dumps(q.get('visual')), review_status=q.get('reviewStatus') or 'Draft',
            lifecycle_state=q.get('lifecycleState') or 'Draft', instructor_approved=False,
            source_metadata_json=json.dumps({}), version=1
        ))
    db.commit()
    n=apply_content_updates(db)
    if n:
        print(f'[startup] Content update applied to {n} questions', flush=True)

def apply_content_updates(db: Session):
    """Idempotent: swap in revised stem/option/explanation text only where the live row still has one of
    the known previous versions, so edits made in Instructor Studio are never overwritten."""
    path=Path(__file__).resolve().parents[1]/'data'/'content_update_2026_09.json'
    if not path.exists():
        return 0
    upd=json.loads(path.read_text(encoding='utf-8')).get('questions',{})
    olds=lambda r:set(r['old'] if isinstance(r.get('old'),list) else [r.get('old')])
    changed=0
    for qid,ch in upd.items():
        q=db.get(Question,qid)
        if not q:
            continue
        dirty=False
        st=ch.get('stem')
        if st and q.stem in olds(st):
            q.stem=st['new'];dirty=True
        opts=ch.get('options')
        if opts:
            try:
                cur=json.loads(q.options_json or '[]')
            except Exception:
                cur=[]
            od=False
            for o in cur:
                r=opts.get(o.get('id'))
                if r and o.get('text') in olds(r):
                    o['text']=r['new'];od=True
            if od:
                q.options_json=json.dumps(cur);dirty=True
        ca=ch.get('correctAnswer')
        if ca:
            try:
                ex=json.loads(q.explanation_json or '{}')
            except Exception:
                ex={}
            if isinstance(ex,dict) and ex.get('correctAnswer') in olds(ca):
                ex['correctAnswer']=ca['new'];q.explanation_json=json.dumps(ex);dirty=True
        if dirty:
            changed+=1
    if changed:
        db.commit()
    return changed

def _slug(s):
    import re
    return re.sub(r'[^a-z0-9]+','_',s.lower()).strip('_')
