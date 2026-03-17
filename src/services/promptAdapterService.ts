// Adapts the master 5-prompt system for each provider type and country.
// The core structure stays the same — only focus areas change.

const PROVIDER_ADAPTATIONS: Record<string, string> = {
  MD: `Focus on USMLE Step 1-3 blueprint topics. Use First Aid and Harrison depth.
Include basic science mechanisms (biochemistry, pathology, physiology, microbiology).
Reference Robbins Pathology, Goodman & Gilman for pharmacology.`,

  DO: `Focus on COMLEX-USA blueprint. Include osteopathic principles and manipulative medicine.
Reference USMLE content as well. Emphasize osteopathic philosophy alongside conventional medicine.`,

  PA: `Focus on PANCE blueprint. Emphasize clinical medicine and procedures.
Include PA-specific scope of practice. Reference AAPA guidelines.
Use PANCE Content Blueprint domains: cardiovascular, pulmonary, GI, musculoskeletal, EENT.`,

  PHARMD: `Focus on NAPLEX competencies. Emphasize drug mechanisms, pharmacokinetics, drug interactions.
Use FDA labeling language. Reference pharmacotherapy textbooks (DiPiro, Koda-Kimble).
Include MPJE pharmacy law content. Use generic drug names followed by (Brand Name).`,

  DDS: `Focus on INBDE blueprint. Include dental anatomy, oral pathology, pharmacology for dentistry.
Reference ADA guidelines. Emphasize infection control, radiography, restorative procedures.`,

  RDH: `Focus on NBDHE blueprint. Emphasize dental hygiene process, preventive care, periodontics.
Reference ADHA standards. Include patient education and community dental health.`,

  DPT: `Focus on NPTE blueprint domains: musculoskeletal, neurological, cardiopulmonary, integumentary.
Emphasize evidence-based rehabilitation. Include outcome measures (DASH, Berg Balance Scale).
Reference CPG clinical practice guidelines from APTA.`,

  OT: `Focus on NBCOT exam domains. Include occupational therapy process, frames of reference.
Emphasize ADL, IADL, therapeutic use of occupation. Reference AOTA standards.`,

  SLP: `Focus on Praxis SLP exam. Include speech, language, swallowing, voice, fluency disorders.
Reference ASHA clinical practice guidelines. Emphasize evidence-based assessment and treatment.`,

  LCSW: `Focus on ASWB Advanced exam content. Include DSM-5 diagnostic criteria.
Emphasize biopsychosocial model. Reference NASW Code of Ethics.
Include theories: attachment, systems, cognitive-behavioral, psychodynamic.`,

  LPC: `Focus on NCE/NCMHCE blueprint. Include counseling theories, group therapy, career counseling.
Reference ACA ethics code. Emphasize DSM-5, cultural competency, trauma-informed care.`,

  LMFT: `Focus on AMFTRB exam. Include family systems theories (Bowen, structural, strategic).
Emphasize relational dynamics, couples therapy. Reference AAMFT ethics code.`,

  PSYCHD: `Focus on EPPP domains. Include psychological assessment, treatment of psychological disorders.
Emphasize research methodology, statistics, neuropsychology. Reference APA ethics code.`,

  BCBA: `Focus on BACB Task List. Include behavior analytic principles, ABA methodology.
Emphasize reinforcement, punishment, extinction. Reference BACB ethics code.
Include skill acquisition, behavior reduction procedures.`,

  RN: `Focus on NCLEX-RN Next Generation format (NGN). Include clinical judgment measurement model.
Emphasize nursing process (ADPIE). Reference ANA standards of practice.
Include priority setting, delegation, safety standards (QSEN, The Joint Commission).`,

  LPN: `Focus on NCLEX-PN blueprint. Emphasize basic nursing care, medication administration.
Include clinical judgment at the PN level. Reference scope of practice limitations for LPN/LVN.`,

  CRNA: `Focus on NCE exam domains. Include advanced anesthesia principles, pharmacology.
Emphasize pre/intra/post-operative care, regional anesthesia. Reference AANA standards.`,

  CNM: `Focus on AMCB exam. Include normal and complicated pregnancies, labor management.
Emphasize midwifery model of care. Reference ACNM standards, evidence-based obstetrics.`,

  RRT: `Focus on NBRC exam (TMC, CSE). Include respiratory pathophysiology, ventilator management.
Emphasize arterial blood gas interpretation, pulmonary function testing.`,

  MLS: `Focus on ASCP BOC exam. Include clinical chemistry, hematology, microbiology, immunology.
Emphasize quality control, laboratory mathematics, reference ranges.`,

  RD: `Focus on CDR RD exam. Include medical nutrition therapy, foodservice management.
Emphasize NCP (Nutrition Care Process). Reference AND evidence-based guidelines.`,

  CCRN: `Focus on AACN CCRN exam domains. Include cardiovascular, respiratory, neurological critical care.
Emphasize hemodynamic monitoring, ventilator management, multi-organ dysfunction.`,
};

const COUNTRY_ADAPTATIONS: Record<string, string> = {
  Canada: `Use Health Canada drug approvals. Reference Canadian clinical guidelines (CMA, CNA).
Note Canadian provincial variations where relevant. Use metric measurements exclusively.
Reference CADTH health technology assessments.`,

  UK: `Use NICE guidelines as primary reference. Reference BNF for drug information.
Note NHS protocols and GMC professional standards. Use British spelling throughout.
Reference MHRA for drug regulatory information.`,

  'UAE-DHA': `Align with DHA licensing requirements. Reference MOH UAE clinical standards.
Note Dubai Health Authority protocols. Include Gulf region epidemiology where relevant.`,

  'UAE-HAAD': `Align with HAAD licensing requirements (now DoH Abu Dhabi).
Reference Abu Dhabi Department of Health standards.`,

  'UAE-MOH': `Align with UAE Ministry of Health standards applicable across all emirates.`,

  Haiti: `Reference Ministry of Health Haiti guidelines. Note limited-resource clinical adaptations.
Include tropical medicine considerations. Reference PAHO/WHO guidelines for the Caribbean.`,

  'Saudi Arabia': `Align with SCFHS licensing requirements. Reference Saudi Drug & Food Authority.
Note Saudi Commission for Health Specialties standards. Include cultural health considerations.`,

  Egypt: `Align with Egyptian Medical Syndicate requirements. Reference MOHP Egypt guidelines.
Note Egyptian drug formulary. Include regional epidemiology.`,

  Jordan: `Align with Jordan Medical Council requirements. Reference Jordanian drug formulary.
Note JFDA (Jordan Food and Drug Administration) standards.`,
};

export function adaptPromptForProvider(
  basePrompt:   string,
  providerType: string,
  country:      string = 'USA'
): string {
  let adapted = basePrompt;

  const providerAdaptation = PROVIDER_ADAPTATIONS[providerType.toUpperCase()];
  if (providerAdaptation) {
    adapted += `\n\n═══ PROVIDER-SPECIFIC STANDARDS ═══\n${providerAdaptation}`;
  }

  const countryKey = Object.keys(COUNTRY_ADAPTATIONS).find(
    k => k.toLowerCase() === country.toLowerCase()
  );
  if (countryKey) {
    adapted += `\n\n═══ COUNTRY-SPECIFIC STANDARDS ═══\n${COUNTRY_ADAPTATIONS[countryKey]}`;
  }

  return adapted;
}

export function getBoardExamForProvider(providerType: string, country = 'USA'): string {
  const map: Record<string, string> = {
    'RN-USA': 'NCLEX-RN', 'LPN-USA': 'NCLEX-PN',
    'FNP-USA': 'ANCC/AANP', 'PMHNP-USA': 'ANCC', 'AGPCNP-USA': 'ANCC/AANP',
    'PNP-USA': 'ANCC/PNCB', 'WHNP-USA': 'NCC', 'AGACNP-USA': 'ANCC',
    'MD-USA': 'USMLE', 'DO-USA': 'COMLEX-USA',
    'PA-USA': 'PANCE', 'PHARMD-USA': 'NAPLEX+MPJE',
    'RN-Canada': 'NCLEX-RN', 'MD-Canada': 'MCCQE',
    'RN-UK': 'NMC CBT+OSCE', 'MD-UK': 'PLAB',
    'DPT-USA': 'NPTE', 'OT-USA': 'NBCOT', 'SLP-USA': 'Praxis SLP',
    'LCSW-USA': 'ASWB', 'LPC-USA': 'NCE/NCMHCE',
  };
  return map[`${providerType.toUpperCase()}-${country}`] || 'Board Exam';
}
