import { PrismaClient, UserRole, PromptType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────
// BOARD EXAM MAPPINGS  (Exec Plan Phase 3 seed data)
// ─────────────────────────────────────────────────────────────────────
const BOARD_EXAM_MAPPINGS = [
  // ── USA ─────────────────────────────────────────────────────────────
  {
    providerType: 'RN', country: 'USA', boardExam: 'NCLEX-RN',
    providerLabel: 'Registered Nurse', boardFullName: 'National Council Licensure Examination - RN',
    examUrl: 'https://www.ncsbn.org/nclex.htm',
    coreClasses: JSON.stringify(['Fundamentals of Nursing','Adult Health Nursing','Pharmacology for Nurses',
      'Pathophysiology','Mental Health Nursing','Maternal-Newborn Nursing','Pediatric Nursing',
      'Medical-Surgical Nursing','Community Health Nursing','NCLEX-RN Review']),
    contentNotes: 'Use FDA drug approvals. JCAHO safety standards. NGN (Next Generation NCLEX) format.',
  },
  {
    providerType: 'LPN', country: 'USA', boardExam: 'NCLEX-PN',
    providerLabel: 'Licensed Practical Nurse', boardFullName: 'National Council Licensure Examination - PN',
    examUrl: 'https://www.ncsbn.org/nclex.htm',
    coreClasses: JSON.stringify(['Fundamentals of Nursing','Basic Pharmacology','Nutrition',
      'Medical-Surgical Nursing I','Mental Health Basics','Maternal-Child Nursing','NCLEX-PN Review']),
    contentNotes: 'Scope of practice: LPN/LVN. Supervised care. FDA drug approvals.',
  },
  {
    providerType: 'FNP', country: 'USA', boardExam: 'ANCC/AANP',
    providerLabel: 'Family Nurse Practitioner', boardFullName: 'ANCC Family NP Certification / AANP FNP-C',
    coreClasses: JSON.stringify(['Advanced Pathophysiology','Advanced Pharmacology','Advanced Health Assessment',
      'Primary Care of Adults','Primary Care of Women','Primary Care of Children',
      'Geriatric Primary Care','Chronic Disease Management','Clinical Diagnostics','FNP Board Review']),
    contentNotes: 'Both ANCC and AANP certifications accepted. Primary care focus. FDA guidelines.',
  },
  {
    providerType: 'AGPCNP', country: 'USA', boardExam: 'ANCC/AANP',
    providerLabel: 'Adult-Gerontology Primary Care NP', boardFullName: 'ANCC Adult-Gero Primary Care NP-BC',
    coreClasses: JSON.stringify(['Advanced Pathophysiology','Advanced Pharmacology','Adult Health Assessment',
      'Geriatric Syndromes','Chronic Disease Management','Preventive Care','AGPCNP Board Review']),
    contentNotes: 'Focus: Adults 18+, strong geriatric component. USPSTF preventive guidelines.',
  },
  {
    providerType: 'PMHNP', country: 'USA', boardExam: 'ANCC',
    providerLabel: 'Psychiatric-Mental Health NP', boardFullName: 'ANCC Psychiatric-Mental Health NP Board Certification',
    examUrl: 'https://www.nursingworld.org/our-certifications/psychiatric-mental-health-nurse-practitioner/',
    coreClasses: JSON.stringify(['Advanced Psychopathology','Psychiatric Assessment & Diagnosis',
      'Psychopharmacology','Psychotherapy Modalities','Child & Adolescent Psychiatry',
      'Substance Use Disorders','Crisis Intervention','Neurobiology of Mental Illness','PMHNP Board Review']),
    contentNotes: 'DSM-5-TR diagnostic criteria. APA treatment guidelines. FDA psychiatric drug approvals.',
  },
  {
    providerType: 'PNP', country: 'USA', boardExam: 'ANCC/PNCB',
    providerLabel: 'Pediatric Nurse Practitioner', boardFullName: 'ANCC PNP-PC / PNCB CPNP',
    coreClasses: JSON.stringify(['Pediatric Pathophysiology','Pediatric Pharmacology','Child Development',
      'Pediatric Primary Care','Adolescent Health','Pediatric Acute Care','PNP Board Review']),
    contentNotes: 'Weight-based dosing. AAP guidelines. Developmental milestones.',
  },
  {
    providerType: 'WHNP', country: 'USA', boardExam: 'NCC WHNP-BC',
    providerLabel: "Women's Health NP", boardFullName: "National Certification Corporation Women's Health NP",
    coreClasses: JSON.stringify(["Women's Health Assessment","Reproductive Endocrinology","OB/GYN Pharmacology",
      'Family Planning','Prenatal Care','Menopause Management','Gynecologic Oncology','WHNP Board Review']),
    contentNotes: "ACOG guidelines. Women's health across the lifespan.",
  },
  {
    providerType: 'NNP', country: 'USA', boardExam: 'NCC NNP-BC',
    providerLabel: 'Neonatal NP', boardFullName: 'National Certification Corporation NNP-BC',
    coreClasses: JSON.stringify(['Neonatal Physiology','Neonatal Pharmacology','Neonatal Assessment',
      'Respiratory Management','Neonatal Nutrition','High-Risk Neonatal Care','NNP Board Review']),
    contentNotes: 'NICU setting. AAP neonatal resuscitation guidelines. Weight-based neonatal dosing.',
  },
  {
    providerType: 'AGACNP', country: 'USA', boardExam: 'ANCC/AANP',
    providerLabel: 'Adult-Gerontology Acute Care NP', boardFullName: 'ANCC AGACNP-BC',
    coreClasses: JSON.stringify(['Critical Care Pathophysiology','Acute Care Pharmacology','Hemodynamics',
      'Mechanical Ventilation','Acute Cardiac Care','Trauma & Emergency','AGACNP Board Review']),
    contentNotes: 'ICU/acute hospital setting. SCCM guidelines. ACLS protocols.',
  },
  {
    providerType: 'CRNA', country: 'USA', boardExam: 'NCE',
    providerLabel: 'Certified Registered Nurse Anesthetist', boardFullName: 'NBCRNA National Certification Examination',
    coreClasses: JSON.stringify(['Anesthesia Pharmacology','Physiology for Anesthesia','Anesthesia Equipment',
      'Regional Anesthesia','Obstetric Anesthesia','Pediatric Anesthesia','NCE Board Review']),
    contentNotes: 'AANA practice standards. ASA guidelines. Pharmacokinetics emphasis.',
  },
  {
    providerType: 'ANP', country: 'USA', boardExam: 'ANCC ANP-BC',
    providerLabel: 'Adult NP', boardFullName: 'ANCC Adult NP Board Certification',
    coreClasses: JSON.stringify(['Advanced Adult Pathophysiology','Advanced Pharmacology',
      'Adult Health Assessment','Chronic Disease','Geriatrics','ANP Board Review']),
    contentNotes: 'Adults 18+. Primary and specialty care. USPSTF guidelines.',
  },
  {
    providerType: 'MD', country: 'USA', boardExam: 'USMLE',
    providerLabel: 'Doctor of Medicine', boardFullName: 'United States Medical Licensing Examination Steps 1-3',
    examUrl: 'https://www.usmle.org/',
    coreClasses: JSON.stringify(['Human Anatomy','Medical Physiology','Biochemistry','Pathology',
      'Pharmacology','Microbiology & Immunology','Behavioral Science','Clinical Medicine',
      'Internal Medicine','Surgery','Pediatrics','OB/GYN','Psychiatry','USMLE Review']),
    contentNotes: 'Harrison-depth science. First Aid alignment. Steps 1/2CK/3 blueprint. FDA guidelines.',
  },
  {
    providerType: 'DO', country: 'USA', boardExam: 'COMLEX',
    providerLabel: 'Doctor of Osteopathic Medicine', boardFullName: 'NBOME Comprehensive Osteopathic Medical Licensing Exam',
    coreClasses: JSON.stringify(['Osteopathic Principles','Anatomy & OMT','Physiology','Pathology',
      'Clinical Medicine','OMM Techniques','COMLEX Review']),
    contentNotes: 'Osteopathic manipulative treatment. AACOM guidelines. Holistic approach.',
  },
  {
    providerType: 'PA', country: 'USA', boardExam: 'PANCE',
    providerLabel: 'Physician Assistant', boardFullName: 'NCCPA Physician Assistant National Certifying Exam',
    coreClasses: JSON.stringify(['Clinical Anatomy','Pathophysiology','PA Pharmacology','Clinical Medicine',
      'Emergency Medicine','Surgery','Pediatrics','OB/GYN','Behavioral Health','PANCE Review']),
    contentNotes: 'PA-specific scope of practice. AAPA guidelines. Physician supervision model.',
  },
  {
    providerType: 'PHARMD', country: 'USA', boardExam: 'NAPLEX+MPJE',
    providerLabel: 'Doctor of Pharmacy', boardFullName: 'NAPLEX (Drug Knowledge) + MPJE (Pharmacy Law)',
    coreClasses: JSON.stringify(['Pharmacology','Pharmacokinetics','Pharmacotherapeutics',
      'Pharmacy Law & Ethics','Drug Information','Sterile Compounding','Clinical Pharmacy','NAPLEX Review']),
    contentNotes: 'FDA drug labeling. USP standards. Drug interactions emphasis. Two exams required.',
  },
  {
    providerType: 'DDS', country: 'USA', boardExam: 'INBDE',
    providerLabel: 'Doctor of Dental Surgery', boardFullName: 'Integrated National Board Dental Examination',
    coreClasses: JSON.stringify(['Oral Anatomy','Dental Pharmacology','Oral Pathology',
      'Periodontology','Prosthodontics','Oral Surgery','Pediatric Dentistry','INBDE Review']),
    contentNotes: 'ADA guidelines. ADEX board requirements. Infection control protocols.',
  },
  {
    providerType: 'PSYCHD', country: 'USA', boardExam: 'EPPP',
    providerLabel: 'Psychologist', boardFullName: 'Association of State & Provincial Psychology Boards EPPP',
    coreClasses: JSON.stringify(['Biological Bases of Behavior','Cognitive-Affective Bases','Social Bases',
      'Growth & Lifespan Development','Assessment & Diagnosis','Treatment & Intervention','Ethics','EPPP Review']),
    contentNotes: 'DSM-5-TR. APA Ethics Code. Evidence-based treatments.',
  },
  {
    providerType: 'LCSW', country: 'USA', boardExam: 'ASWB Clinical',
    providerLabel: 'Licensed Clinical Social Worker', boardFullName: 'Association of Social Work Boards Clinical Exam',
    coreClasses: JSON.stringify(['Human Behavior & Social Environment','Social Work Practice',
      'Clinical Assessment','Psychopathology & DSM','Biopsychosocial Model','Trauma-Informed Care','ASWB Review']),
    contentNotes: 'NASW Code of Ethics. DSM-5-TR. Biopsychosocial-spiritual framework.',
  },
  {
    providerType: 'LPC', country: 'USA', boardExam: 'NCE/NCMHCE',
    providerLabel: 'Licensed Professional Counselor', boardFullName: 'NBCC National Counselor Exam / Clinical Mental Health',
    coreClasses: JSON.stringify(['Counseling Theory','Human Development','Group Counseling',
      'Career Counseling','Assessment','Research Methods','Clinical Mental Health','NCE Review']),
    contentNotes: 'ACA Code of Ethics. DSM-5-TR. Evidence-based counseling models.',
  },
  {
    providerType: 'DPT', country: 'USA', boardExam: 'NPTE',
    providerLabel: 'Doctor of Physical Therapy', boardFullName: 'FSBPT National Physical Therapy Examination',
    coreClasses: JSON.stringify(['Musculoskeletal PT','Neurological PT','Cardiopulmonary PT',
      'Pediatric PT','Geriatric PT','Integumentary PT','Evidence-Based Practice','NPTE Review']),
    contentNotes: 'APTA clinical practice guidelines. ICF framework. Outcome measures.',
  },
  {
    providerType: 'OT', country: 'USA', boardExam: 'NBCOT',
    providerLabel: 'Occupational Therapist', boardFullName: 'National Board for Certification in Occupational Therapy',
    coreClasses: JSON.stringify(['Occupational Science','OT Theory & Models','Pediatric OT',
      'Adult Rehabilitation','Mental Health OT','Assistive Technology','NBCOT Review']),
    contentNotes: 'AOTA practice framework. Occupation-based approach. ADL/IADL focus.',
  },
  {
    providerType: 'SLP', country: 'USA', boardExam: 'Praxis SLP',
    providerLabel: 'Speech-Language Pathologist', boardFullName: 'ETS Praxis Speech-Language Pathology Exam',
    coreClasses: JSON.stringify(['Anatomy of Speech','Language Disorders','Articulation Disorders',
      'Fluency','Voice Disorders','Dysphagia','Augmentative Communication','Praxis Review']),
    contentNotes: 'ASHA guidelines. Evidence-based treatment protocols. Dysphagia management.',
  },
  {
    providerType: 'RD', country: 'USA', boardExam: 'RD Exam',
    providerLabel: 'Registered Dietitian', boardFullName: 'CDR Registered Dietitian Nutritionist Exam',
    coreClasses: JSON.stringify(['Nutrition Science','Medical Nutrition Therapy','Food Service Management',
      'Community Nutrition','Clinical Nutrition','Nutrition Assessment','RD Exam Review']),
    contentNotes: 'Academy of Nutrition and Dietetics. Evidence-based nutrition practice.',
  },
  {
    providerType: 'RRT', country: 'USA', boardExam: 'NBRC',
    providerLabel: 'Respiratory Therapist', boardFullName: 'NBRC Certified Respiratory Therapist / RRT Exam',
    coreClasses: JSON.stringify(['Pulmonary Anatomy','Respiratory Pharmacology','Mechanical Ventilation',
      'Arterial Blood Gases','Neonatal Respiratory','Pulmonary Rehab','NBRC Review']),
    contentNotes: 'AARC clinical practice guidelines. Ventilator management protocols.',
  },
  {
    providerType: 'MLS', country: 'USA', boardExam: 'ASCP',
    providerLabel: 'Medical Laboratory Scientist', boardFullName: 'ASCP Medical Laboratory Scientist Certification',
    coreClasses: JSON.stringify(['Clinical Chemistry','Hematology','Microbiology',
      'Immunohematology','Immunology','Molecular Diagnostics','ASCP Review']),
    contentNotes: 'CLSI standards. CAP accreditation requirements. Laboratory safety.',
  },
  {
    providerType: 'CCRN', country: 'USA', boardExam: 'CCRN',
    providerLabel: 'Critical Care Registered Nurse', boardFullName: 'AACN Critical Care RN Certification',
    coreClasses: JSON.stringify(['Critical Care Cardiovascular','Critical Care Pulmonary',
      'Critical Care Neurology','Sepsis & Shock','Hemodynamic Monitoring','CCRN Review']),
    contentNotes: 'AACN practice standards. Synergy Model. SCCM guidelines.',
  },
  // ── CANADA ──────────────────────────────────────────────────────────
  {
    providerType: 'RN', country: 'Canada', boardExam: 'NCLEX-RN',
    providerLabel: 'Registered Nurse', boardFullName: 'NCLEX-RN (adopted by Canada 2015)',
    coreClasses: JSON.stringify(['Fundamentals of Nursing','Health Assessment','Pharmacology',
      'Medical-Surgical Nursing','Mental Health Nursing','Maternal-Child Nursing','NCLEX-RN Review']),
    contentNotes: 'Health Canada drug approvals. CNA standards. Canadian clinical guidelines.',
  },
  {
    providerType: 'MD', country: 'Canada', boardExam: 'MCCQE',
    providerLabel: 'Doctor of Medicine', boardFullName: 'Medical Council of Canada Qualifying Exam Parts I & II',
    examUrl: 'https://mcc.ca/examinations/mccqe1/',
    coreClasses: JSON.stringify(['Clinical Medicine','Internal Medicine','Surgery',
      'Pediatrics','OB/GYN','Psychiatry','Emergency Medicine','MCCQE Review']),
    contentNotes: 'Health Canada guidelines. Canadian clinical practice. Provincial health systems.',
  },
  {
    providerType: 'PA', country: 'Canada', boardExam: 'CASPA',
    providerLabel: 'Physician Assistant', boardFullName: 'Canadian Association of Physician Assistants',
    coreClasses: JSON.stringify(['Clinical Medicine','Pathophysiology','Pharmacology',
      'Clinical Assessment','PA Practice in Canada','CASPA Review']),
    contentNotes: 'Canadian PA scope of practice. Provincial regulations. Health Canada.',
  },
  {
    providerType: 'PHARMD', country: 'Canada', boardExam: 'PEBC',
    providerLabel: 'Doctor of Pharmacy', boardFullName: 'Pharmacy Examining Board of Canada Qualifying Exam',
    coreClasses: JSON.stringify(['Canadian Pharmacology','Pharmacy Law (Canada)','Drug Therapy',
      'Pharmaceutical Sciences','Patient Care','PEBC Review']),
    contentNotes: 'Health Canada drug approvals. Canadian pharmacy law. Provincial regulations.',
  },
  // ── UK ───────────────────────────────────────────────────────────────
  {
    providerType: 'RN', country: 'UK', boardExam: 'NMC CBT+OSCE',
    providerLabel: 'Registered Nurse', boardFullName: 'Nursing & Midwifery Council Test of Competence',
    examUrl: 'https://www.nmc.org.uk/registration/joining-the-register/',
    coreClasses: JSON.stringify(['Fundamentals of Nursing (UK)','NMC Code of Conduct','UK Pharmacology (BNF)',
      'Adult Nursing','Mental Health Nursing (UK)','NICE Guidelines','NMC Test Prep']),
    contentNotes: 'NICE guidelines. BNF drug reference. NHS protocols. NMC Code of Conduct.',
  },
  {
    providerType: 'MD', country: 'UK', boardExam: 'PLAB',
    providerLabel: 'Doctor of Medicine (International Graduate)', boardFullName: 'GMC Professional & Linguistic Assessments Board Parts 1 & 2',
    examUrl: 'https://www.gmc-uk.org/registration-and-licensing/join-the-register/plab',
    coreClasses: JSON.stringify(['Clinical Medicine (UK)','NICE Guidelines','NHS Protocols',
      'BNF Pharmacology','Medical Ethics (GMC)','PLAB 1 Review','PLAB 2 OSCE']),
    contentNotes: 'GMC Good Medical Practice. NICE guidelines. BNF drug formulary. NHS structure.',
  },
  {
    providerType: 'PHARMD', country: 'UK', boardExam: 'GPhC Registration',
    providerLabel: 'Pharmacist', boardFullName: 'General Pharmaceutical Council Registration Assessment',
    coreClasses: JSON.stringify(['Clinical Pharmacy (UK)','BNF Drug Reference','Pharmacy Law (UK)',
      'Medicines Optimisation','GPhC Standards','Registration Exam Review']),
    contentNotes: 'GPhC standards. BNF/BNFC. UK pharmacy law. NHS dispensing.',
  },
  // ── HAITI ────────────────────────────────────────────────────────────
  {
    providerType: 'MD', country: 'Haiti', boardExam: 'Haiti National Board',
    providerLabel: 'Doctor of Medicine', boardFullName: 'Haiti Ministry of Health National Board Examination',
    coreClasses: JSON.stringify(['Basic Medical Sciences','Internal Medicine','Surgery',
      'Pediatrics','OB/GYN','Tropical Medicine','Community Health','Board Review']),
    contentNotes: 'Haiti MoH guidelines. Tropical disease burden. French/Creole context. Limited resources.',
  },
  {
    providerType: 'RN', country: 'Haiti', boardExam: 'Haiti Nursing Board',
    providerLabel: 'Registered Nurse', boardFullName: 'Haiti Ministry of Health National Nursing Board',
    coreClasses: JSON.stringify(['Fundamentals (Haiti)','Medical-Surgical','Maternal-Child',
      'Mental Health','Community Health Haiti','Board Review']),
    contentNotes: 'Haiti nursing council standards. French/Creole language. Limited resource settings.',
  },
  // ── UAE ──────────────────────────────────────────────────────────────
  {
    providerType: 'MD', country: 'UAE-DHA', boardExam: 'DHA Exam',
    providerLabel: 'Doctor of Medicine (Dubai)', boardFullName: 'Dubai Health Authority Licensing Examination',
    examUrl: 'https://www.dha.gov.ae/',
    coreClasses: JSON.stringify(['DHA Clinical Standards','Internal Medicine','Surgery',
      'Pediatrics','Emergency Medicine','DHA Exam Review']),
    contentNotes: 'DHA licensing standards. Dubai health regulations. MOH UAE guidelines.',
  },
  {
    providerType: 'MD', country: 'UAE-HAAD', boardExam: 'HAAD Exam',
    providerLabel: 'Doctor of Medicine (Abu Dhabi)', boardFullName: 'Health Authority Abu Dhabi Licensing Examination',
    examUrl: 'https://www.doh.gov.ae/',
    coreClasses: JSON.stringify(['HAAD Clinical Standards','Clinical Medicine','Surgery',
      'Pediatrics','HAAD Exam Review']),
    contentNotes: 'HAAD/DoH Abu Dhabi standards. Abu Dhabi health regulations.',
  },
  {
    providerType: 'RN', country: 'UAE-DHA', boardExam: 'DHA Exam',
    providerLabel: 'Registered Nurse (Dubai)', boardFullName: 'Dubai Health Authority RN Licensing',
    coreClasses: JSON.stringify(['Nursing Fundamentals','Medical-Surgical','Pharmacology (UAE)',
      'Patient Safety','DHA Nursing Standards','Exam Review']),
    contentNotes: 'DHA nursing standards. MOH UAE drug formulary.',
  },
  // ── SAUDI ARABIA ─────────────────────────────────────────────────────
  {
    providerType: 'MD', country: 'Saudi Arabia', boardExam: 'SCFHS/SLE',
    providerLabel: 'Doctor of Medicine', boardFullName: 'Saudi Commission for Health Specialties / Saudi Licensing Exam',
    examUrl: 'https://www.scfhs.org.sa/',
    coreClasses: JSON.stringify(['Clinical Medicine','Saudi MOH Standards','Internal Medicine',
      'Surgery','Pediatrics','Family Medicine','SLE Review']),
    contentNotes: 'SCFHS standards. Saudi MOH clinical guidelines. Halal medication alternatives.',
  },
  {
    providerType: 'RN', country: 'Saudi Arabia', boardExam: 'SCFHS',
    providerLabel: 'Registered Nurse', boardFullName: 'Saudi Commission for Health Specialties Nursing',
    coreClasses: JSON.stringify(['Nursing Fundamentals','Saudi MOH Nursing Standards',
      'Medical-Surgical Nursing','Critical Care Nursing','SCFHS Review']),
    contentNotes: 'SCFHS nursing standards. Saudi MOH guidelines.',
  },
  // ── EGYPT ────────────────────────────────────────────────────────────
  {
    providerType: 'MD', country: 'Egypt', boardExam: 'Egyptian Medical Syndicate',
    providerLabel: 'Doctor of Medicine', boardFullName: 'Egyptian Medical Syndicate Licensing',
    coreClasses: JSON.stringify(['Basic Medical Sciences','Internal Medicine','Surgery',
      'Pediatrics','OB/GYN','Community Medicine','Egyptian Board Review']),
    contentNotes: 'Egyptian MOH guidelines. Arabic language support. Regional disease patterns.',
  },
  // ── JORDAN ───────────────────────────────────────────────────────────
  {
    providerType: 'MD', country: 'Jordan', boardExam: 'Jordan Medical Council',
    providerLabel: 'Doctor of Medicine', boardFullName: 'Jordan Medical Council National Licensing Exam',
    coreClasses: JSON.stringify(['Clinical Medicine','Jordan MOH Standards','Internal Medicine',
      'Surgery','Pediatrics','Family Medicine','JMC Review']),
    contentNotes: 'JMC licensing standards. Jordanian MOH guidelines. Arabic language.',
  },
  {
    providerType: 'RN', country: 'Jordan', boardExam: 'Jordan Nursing Council',
    providerLabel: 'Registered Nurse', boardFullName: 'Jordan Nursing Council National Licensing',
    coreClasses: JSON.stringify(['Nursing Fundamentals','Medical-Surgical Nursing',
      'Maternal-Child Nursing','Mental Health Nursing','JNC Review']),
    contentNotes: 'JNC standards. Jordanian MOH nursing guidelines.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// DEFAULT PROMPTS
// ─────────────────────────────────────────────────────────────────────
const DEFAULT_PROMPTS = [
  {
    name: 'Master TOC Generator',
    type: PromptType.TOC,
    content: `You are a senior medical education curriculum designer.

Generate a Table of Contents for a {TRACK} {BUNDLE_TYPE} textbook (Book {TRACK_NUMBER} of 4).
Board Exam: {BOARD_EXAM} | Country: {COUNTRY}

Requirements:
- Exactly 18 major chapters
- Each chapter must align with {BOARD_EXAM} blueprint topics
- Chapters progress logically from foundational to advanced
- Include 3-5 subtopics per chapter

Return ONLY valid JSON:
{
  "bookTitle": "SEO-optimized title",
  "totalChapters": 18,
  "chapters": [
    { "number": 1, "title": "Chapter Title", "subtopics": ["topic1","topic2","topic3"] }
  ]
}`,
  },
  {
    name: 'Master Chapter Generator',
    type: PromptType.CHAPTER,
    content: `You are a senior medical textbook author writing for {TRACK} students preparing for {BOARD_EXAM}.

Write Chapter {CHAPTER_NUMBER}: {CHAPTER_TITLE}

MANDATORY STRUCTURE (all sections REQUIRED — chapter fails QA if any section is missing):
1. **Explanation** — comprehensive academic content, minimum 2,000 words, Harrison-depth
2. **Book Summary** — concise clinical bullets for quick review
3. **Quick Dictionary Before You Read** — define 15+ key terms
4. **Exam-Relevant Pearls** — 10+ high-yield facts; bold the testable value in each
5. **Future Findings** — emerging research, guidelines-in-progress (minimum 3 items)
6. **References** — minimum 20 APA 7th edition citations (≥15 from last 4 years)

FORMATTING RULES:
- Medications: Generic Name (Brand Name) on first mention only
- Bold: selective key terms only — NEVER bold entire sentences or paragraphs
- Clinical vignettes: include 2-3 per chapter
- Minimum total word count: 4,000 words

Country: {COUNTRY} — use {COUNTRY}-appropriate clinical guidelines
{PROVIDER_ADAPTATION}

Write the complete chapter now:`,
  },
  {
    name: 'Master QA Auditor',
    type: PromptType.QA,
    content: `You are a strict QA auditor for medical textbooks published by Zarwango-Lubega-Muyizzi Publishing.

Audit this chapter for: {TRACK} | Board Exam: {BOARD_EXAM} | Chapter: {CHAPTER_TITLE}

CHAPTER CONTENT:
{CONTENT}

Check ALL criteria and return ONLY valid JSON:
{
  "overallScore": 0-100,
  "passed": true/false,
  "apaViolations": ["list APA 7th edition errors found"],
  "boldGovernanceIssues": ["list over-bolded passages"],
  "redundancyFlags": ["list repeated content"],
  "medicationErrors": ["medications not in Generic (Brand) format"],
  "structureIssues": ["missing required sections"],
  "depthScore": 0-100,
  "citationCount": number,
  "recentCitations": number,
  "feedback": "constructive improvement notes"
}

PASS CRITERIA: Score ≥70, all 6 sections present, ≥20 citations, ≥15 recent citations.`,
  },
  {
    name: 'Exam-Relevant Pearls Generator',
    type: PromptType.PEARL,
    content: `Generate 15 high-yield exam pearls for {TRACK} students on the topic: {CHAPTER_TITLE}

Each pearl must:
- Start with a clinical scenario or key fact
- Bold the single most testable value
- Be directly testable on {BOARD_EXAM}
- Be 1-2 sentences maximum

Format as a numbered list.`,
  },
  {
    name: 'APA References Generator',
    type: PromptType.REFERENCE,
    content: `Generate 25 real APA 7th edition references for: {CHAPTER_TITLE} ({TRACK})

Requirements:
- Minimum 20 references from the last 4 years
- Include mix of: clinical guidelines, peer-reviewed journals, textbooks
- Use real journal names (NEJM, JAMA, Lancet, etc.)
- Format exactly per APA 7th edition
- All references must be clinically relevant to {BOARD_EXAM}

Output as a numbered reference list.`,
  },
];

// ─────────────────────────────────────────────────────────────────────
// SEED FUNCTION
// ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Starting database seed...\n');

  // ── Admin User ────────────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@zlm.com';
  const adminPass  = process.env.ADMIN_PASSWORD || 'ZLM@dmin2026!';

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPass, 12);
    await prisma.user.create({
      data: { email: adminEmail, passwordHash: hash, name: 'ZLM Admin', role: UserRole.ADMIN },
    });
    console.log(`✅ Admin user created: ${adminEmail}`);
    console.log(`   Password: ${adminPass}`);
    console.log('   ⚠️  Change this password immediately after first login!\n');
  } else {
    console.log(`ℹ️  Admin user already exists: ${adminEmail}\n`);
  }

  // ── Demo Content Manager ──────────────────────────────────────────
  const contentEmail = 'content@zlm.com';
  if (!(await prisma.user.findUnique({ where: { email: contentEmail } }))) {
    const hash = await bcrypt.hash('ZLMcontent2026!', 12);
    await prisma.user.create({
      data: { email: contentEmail, passwordHash: hash, name: 'Content Manager', role: UserRole.CONTENT_MANAGER },
    });
    console.log('✅ Content Manager user created: content@zlm.com');
  }

  // ── Board Exam Mappings ───────────────────────────────────────────
  let mappingCount = 0;
  for (const mapping of BOARD_EXAM_MAPPINGS) {
    await prisma.boardExamMapping.upsert({
      where:  { providerType_country: { providerType: mapping.providerType, country: mapping.country } },
      update: { ...mapping, updatedAt: new Date() },
      create: mapping,
    });
    mappingCount++;
  }
  console.log(`✅ Board exam mappings seeded: ${mappingCount} entries`);

  // ── Default Prompts ───────────────────────────────────────────────
  let promptCount = 0;
  for (const p of DEFAULT_PROMPTS) {
    const existing = await prisma.prompt.findFirst({ where: { type: p.type, isActive: true } });
    if (!existing) {
      await prisma.prompt.create({ data: { ...p, version: 1, isActive: true, createdBy: 'system' } });
      promptCount++;
    }
  }
  console.log(`✅ Default prompts seeded: ${promptCount} new prompts`);

  console.log('\n🎉 Seed complete!\n');
  console.log('📋 Login credentials:');
  console.log(`   Admin:   ${adminEmail} / ${adminPass}`);
  console.log('   Content: content@zlm.com / ZLMcontent2026!\n');
  console.log('⚠️  IMPORTANT: Change all passwords before going live!');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
