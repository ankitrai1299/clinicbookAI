// ─────────────────────────────────────────────────────────────────────────────
// MEDICAL TERMS GLOSSARY
//
// Sarvam speech-to-text often mis-hears medicine / diagnosis / test names because
// of pronunciation (e.g. "azithromicin" → Azithromycin). The scribe uses THIS list
// to (a) correct near-miss spellings in the generated report and (b) tell the report
// AI the exact spellings to use.
//
// 👉 TO ADD YOUR CLINIC'S TERMS: just add a line inside the array below (any casing).
//    Drug names, diagnoses, investigations, procedures — all welcome.
// ─────────────────────────────────────────────────────────────────────────────

export const MEDICAL_TERMS: string[] = [
  // ── Medicines (common in India) ──────────────────────────────
  'Paracetamol', 'Acetaminophen', 'Azithromycin', 'Amoxicillin', 'Amoxicillin Clavulanate',
  'Augmentin', 'Metformin', 'Telmisartan', 'Amlodipine', 'Atorvastatin', 'Rosuvastatin',
  'Pantoprazole', 'Omeprazole', 'Esomeprazole', 'Rabeprazole', 'Cetirizine', 'Levocetirizine',
  'Montelukast', 'Ibuprofen', 'Diclofenac', 'Aceclofenac', 'Aspirin', 'Metronidazole',
  'Ciprofloxacin', 'Ofloxacin', 'Levofloxacin', 'Doxycycline', 'Cefixime', 'Cefpodoxime',
  'Ceftriaxone', 'Cefuroxime', 'Ranitidine', 'Domperidone', 'Ondansetron', 'Insulin',
  'Glimepiride', 'Gliclazide', 'Sitagliptin', 'Vildagliptin', 'Losartan', 'Ramipril',
  'Enalapril', 'Clopidogrel', 'Furosemide', 'Torsemide', 'Spironolactone', 'Prednisolone',
  'Deflazacort', 'Dexamethasone', 'Hydrocortisone', 'Salbutamol', 'Levosalbutamol', 'Budesonide',
  'Formoterol', 'Ipratropium', 'Hydrochlorothiazide', 'Metoprolol', 'Atenolol', 'Bisoprolol',
  'Nebivolol', 'Thyroxine', 'Levothyroxine', 'Chlorpheniramine', 'Diphenhydramine',
  'Ambroxol', 'Bromhexine', 'Guaifenesin', 'Dextromethorphan', 'Albendazole', 'Ivermectin',
  'Fluconazole', 'Itraconazole', 'Clotrimazole', 'Acyclovir', 'Oseltamivir', 'Tramadol',
  'Gabapentin', 'Pregabalin', 'Amitriptyline', 'Sertraline', 'Escitalopram', 'Alprazolam',
  'Clonazepam', 'Vitamin D3', 'Cholecalciferol', 'Vitamin B12', 'Methylcobalamin', 'Folic Acid',
  'Calcium Carbonate', 'Ferrous Sulphate', 'Ferrous Ascorbate', 'Zinc', 'Multivitamin', 'ORS',

  // ── Diagnoses / conditions ───────────────────────────────────
  'Hypertension', 'Type 1 Diabetes', 'Type 2 Diabetes', 'Diabetes Mellitus', 'Prediabetes',
  'Asthma', 'Pneumonia', 'Bronchitis', 'Bronchiolitis', 'Tuberculosis', 'COPD', 'Anemia',
  'Iron Deficiency Anemia', 'Migraine', 'Tension Headache', 'Gastritis', 'GERD', 'Peptic Ulcer',
  'Hypothyroidism', 'Hyperthyroidism', 'Dengue', 'Malaria', 'Chikungunya', 'Typhoid',
  'Gastroenteritis', 'Urinary Tract Infection', 'Upper Respiratory Tract Infection',
  'Lower Respiratory Tract Infection', 'Viral Fever', 'Dyslipidemia', 'Hypercholesterolemia',
  'Arthritis', 'Rheumatoid Arthritis', 'Osteoarthritis', 'Gout', 'Sinusitis', 'Pharyngitis',
  'Tonsillitis', 'Otitis Media', 'Conjunctivitis', 'Dermatitis', 'Eczema', 'Psoriasis',
  'Cellulitis', 'Hyperlipidemia', 'Obesity', 'Vitamin D Deficiency', 'Hypoglycemia',
  'Hyperglycemia', 'Cervical Spondylosis', 'Lumbar Spondylosis', 'Sciatica', 'Vertigo',

  // ── Investigations / tests ───────────────────────────────────
  'CBC', 'Complete Blood Count', 'HbA1c', 'Glycated Hemoglobin', 'Lipid Profile', 'LFT',
  'Liver Function Test', 'KFT', 'RFT', 'Renal Function Test', 'Thyroid Profile', 'TSH', 'T3', 'T4',
  'Chest X-ray', 'X-ray', 'ECG', 'Echocardiography', '2D Echo', 'Ultrasound', 'USG Abdomen',
  'CT Scan', 'MRI', 'Urine Routine', 'Urine Culture', 'Blood Sugar Fasting', 'Blood Sugar PP',
  'Random Blood Sugar', 'Serum Creatinine', 'Blood Urea', 'Serum Electrolytes', 'CRP', 'ESR',
  'D-Dimer', 'Troponin', 'Vitamin D', 'Vitamin B12', 'Serum Ferritin', 'Peripheral Smear',
  'Blood Culture', 'Sputum AFB', 'COVID RT-PCR', 'Dengue NS1', 'Widal Test', 'Mantoux Test',
];
