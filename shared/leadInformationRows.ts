/** Canonical scanned-information fields; unknown labels are controlled by Other information. */
export const LEAD_INFORMATION_ROWS = [
  {
    "key": "document.document_type",
    "label": "Document type",
    "group": "Document",
    "clinical": true
  },
  {
    "key": "patient.sex",
    "label": "Sex",
    "group": "Patient",
    "clinical": true
  },
  {
    "key": "patient.medical_record_number",
    "label": "Medical record number",
    "group": "Patient",
    "clinical": true
  },
  {
    "key": "insurance.insurance_carrier",
    "label": "Insurance carrier",
    "group": "Insurance",
    "clinical": true
  },
  {
    "key": "insurance.insurance_plan",
    "label": "Insurance plan",
    "group": "Insurance",
    "clinical": true
  },
  {
    "key": "insurance.member_id",
    "label": "Member ID",
    "group": "Insurance",
    "clinical": true
  },
  {
    "key": "insurance.group_number",
    "label": "Group number",
    "group": "Insurance",
    "clinical": true
  },
  {
    "key": "insurance.policy_holder",
    "label": "Policy holder",
    "group": "Insurance",
    "clinical": true
  },
  {
    "key": "referral.referral_date",
    "label": "Referral date",
    "group": "Referral",
    "clinical": true
  },
  {
    "key": "referral.reason_for_referral",
    "label": "Reason for referral",
    "group": "Referral",
    "clinical": true
  },
  {
    "key": "referral.order_name",
    "label": "Order name",
    "group": "Referral",
    "clinical": true
  },
  {
    "key": "referral.urgency_priority",
    "label": "Urgency / priority",
    "group": "Referral",
    "clinical": true
  },
  {
    "key": "referral.appointment_instructions",
    "label": "Appointment instructions",
    "group": "Referral",
    "clinical": true
  },
  {
    "key": "referral.requested_authorized_visits",
    "label": "Requested / authorized visits",
    "group": "Referral",
    "clinical": true
  },
  {
    "key": "authorization.authorization_number",
    "label": "Authorization number",
    "group": "Authorization",
    "clinical": true
  },
  {
    "key": "authorization.authorization_status",
    "label": "Authorization status",
    "group": "Authorization",
    "clinical": true
  },
  {
    "key": "authorization.authorization_start_date",
    "label": "Authorization start date",
    "group": "Authorization",
    "clinical": true
  },
  {
    "key": "authorization.authorization_end_date",
    "label": "Authorization end date",
    "group": "Authorization",
    "clinical": true
  },
  {
    "key": "codes.icd_codes",
    "label": "ICD codes",
    "group": "Codes",
    "clinical": true
  },
  {
    "key": "codes.cpt_hcpcs_codes",
    "label": "CPT / HCPCS codes",
    "group": "Codes",
    "clinical": true
  },
  {
    "key": "referring_provider.provider",
    "label": "Provider",
    "group": "Referring provider",
    "clinical": true
  },
  {
    "key": "referring_provider.credentials",
    "label": "Credentials",
    "group": "Referring provider",
    "clinical": true
  },
  {
    "key": "referring_provider.practice_facility",
    "label": "Practice / facility",
    "group": "Referring provider",
    "clinical": true
  },
  {
    "key": "referring_provider.specialty",
    "label": "Specialty",
    "group": "Referring provider",
    "clinical": true
  },
  {
    "key": "referring_provider.npi",
    "label": "NPI",
    "group": "Referring provider",
    "clinical": true
  },
  {
    "key": "referring_provider.phone",
    "label": "Phone",
    "group": "Referring provider",
    "clinical": true
  },
  {
    "key": "referring_provider.fax",
    "label": "Fax",
    "group": "Referring provider",
    "clinical": true
  },
  {
    "key": "referring_provider.address",
    "label": "Address",
    "group": "Referring provider",
    "clinical": true
  },
  {
    "key": "receiving_provider.provider",
    "label": "Provider",
    "group": "Receiving provider",
    "clinical": true
  },
  {
    "key": "receiving_provider.practice_facility",
    "label": "Practice / facility",
    "group": "Receiving provider",
    "clinical": true
  },
  {
    "key": "receiving_provider.specialty",
    "label": "Specialty",
    "group": "Receiving provider",
    "clinical": true
  },
  {
    "key": "receiving_provider.npi",
    "label": "NPI",
    "group": "Receiving provider",
    "clinical": true
  },
  {
    "key": "receiving_provider.phone",
    "label": "Phone",
    "group": "Receiving provider",
    "clinical": true
  },
  {
    "key": "receiving_provider.fax",
    "label": "Fax",
    "group": "Receiving provider",
    "clinical": true
  },
  {
    "key": "receiving_provider.address",
    "label": "Address",
    "group": "Receiving provider",
    "clinical": true
  },
  {
    "key": "hospital_encounter.facility",
    "label": "Facility",
    "group": "Hospital encounter",
    "clinical": true
  },
  {
    "key": "hospital_encounter.facility_location",
    "label": "Facility location",
    "group": "Hospital encounter",
    "clinical": true
  },
  {
    "key": "hospital_encounter.encounter_type",
    "label": "Encounter type",
    "group": "Hospital encounter",
    "clinical": true
  },
  {
    "key": "hospital_encounter.financial_account_number",
    "label": "Financial / account number",
    "group": "Hospital encounter",
    "clinical": true
  },
  {
    "key": "hospital_encounter.arrival_date",
    "label": "Arrival date",
    "group": "Hospital encounter",
    "clinical": true
  },
  {
    "key": "hospital_encounter.arrival_time",
    "label": "Arrival time",
    "group": "Hospital encounter",
    "clinical": true
  },
  {
    "key": "hospital_encounter.admit_date",
    "label": "Admit date",
    "group": "Hospital encounter",
    "clinical": true
  },
  {
    "key": "hospital_encounter.admit_time",
    "label": "Admit time",
    "group": "Hospital encounter",
    "clinical": true
  },
  {
    "key": "hospital_encounter.discharge_date",
    "label": "Discharge date",
    "group": "Hospital encounter",
    "clinical": true
  },
  {
    "key": "hospital_encounter.discharge_time",
    "label": "Discharge time",
    "group": "Hospital encounter",
    "clinical": true
  },
  {
    "key": "hospital_encounter.room_bed",
    "label": "Room / bed",
    "group": "Hospital encounter",
    "clinical": true
  },
  {
    "key": "hospital_encounter.length_of_stay",
    "label": "Length of stay",
    "group": "Hospital encounter",
    "clinical": true
  },
  {
    "key": "patient_demographics.patient_language",
    "label": "Patient language",
    "group": "Patient demographics",
    "clinical": true
  },
  {
    "key": "patient_demographics.race",
    "label": "Race",
    "group": "Patient demographics",
    "clinical": true
  },
  {
    "key": "patient_demographics.religion",
    "label": "Religion",
    "group": "Patient demographics",
    "clinical": true
  },
  {
    "key": "patient_demographics.ethnic_group",
    "label": "Ethnic group",
    "group": "Patient demographics",
    "clinical": true
  },
  {
    "key": "patient_demographics.country_of_birth",
    "label": "Country of birth",
    "group": "Patient demographics",
    "clinical": true
  },
  {
    "key": "patient_demographics.marital_status",
    "label": "Marital status",
    "group": "Patient demographics",
    "clinical": true
  },
  {
    "key": "patient_demographics.occupation",
    "label": "Occupation",
    "group": "Patient demographics",
    "clinical": true
  },
  {
    "key": "patient_contact.cell_phone",
    "label": "Cell phone",
    "group": "Patient contact",
    "clinical": true
  },
  {
    "key": "patient_contact.alternate_phone",
    "label": "Alternate phone",
    "group": "Patient contact",
    "clinical": true
  },
  {
    "key": "next_of_kin.name",
    "label": "Name",
    "group": "Next of kin",
    "clinical": true
  },
  {
    "key": "next_of_kin.relationship",
    "label": "Relationship",
    "group": "Next of kin",
    "clinical": true
  },
  {
    "key": "next_of_kin.phone",
    "label": "Phone",
    "group": "Next of kin",
    "clinical": true
  },
  {
    "key": "emergency_contact.name",
    "label": "Name",
    "group": "Emergency contact",
    "clinical": true
  },
  {
    "key": "emergency_contact.relationship",
    "label": "Relationship",
    "group": "Emergency contact",
    "clinical": true
  },
  {
    "key": "emergency_contact.phone",
    "label": "Phone",
    "group": "Emergency contact",
    "clinical": true
  },
  {
    "key": "guarantor.name",
    "label": "Name",
    "group": "Guarantor",
    "clinical": true
  },
  {
    "key": "guarantor.relationship",
    "label": "Relationship",
    "group": "Guarantor",
    "clinical": true
  },
  {
    "key": "guarantor.phone",
    "label": "Phone",
    "group": "Guarantor",
    "clinical": true
  },
  {
    "key": "guarantor.address",
    "label": "Address",
    "group": "Guarantor",
    "clinical": true
  },
  {
    "key": "primary_insurance.carrier",
    "label": "Carrier",
    "group": "Primary insurance",
    "clinical": true
  },
  {
    "key": "primary_insurance.plan",
    "label": "Plan",
    "group": "Primary insurance",
    "clinical": true
  },
  {
    "key": "primary_insurance.member_policy_id",
    "label": "Member / policy ID",
    "group": "Primary insurance",
    "clinical": true
  },
  {
    "key": "primary_insurance.group_number",
    "label": "Group number",
    "group": "Primary insurance",
    "clinical": true
  },
  {
    "key": "primary_insurance.authorization_number",
    "label": "Authorization number",
    "group": "Primary insurance",
    "clinical": true
  },
  {
    "key": "secondary_insurance.carrier",
    "label": "Carrier",
    "group": "Secondary insurance",
    "clinical": true
  },
  {
    "key": "secondary_insurance.plan",
    "label": "Plan",
    "group": "Secondary insurance",
    "clinical": true
  },
  {
    "key": "secondary_insurance.member_policy_id",
    "label": "Member / policy ID",
    "group": "Secondary insurance",
    "clinical": true
  },
  {
    "key": "secondary_insurance.group_number",
    "label": "Group number",
    "group": "Secondary insurance",
    "clinical": true
  },
  {
    "key": "care_team.attending_physician",
    "label": "Attending physician",
    "group": "Care team",
    "clinical": true
  },
  {
    "key": "care_team.emergency_physician",
    "label": "Emergency physician",
    "group": "Care team",
    "clinical": true
  },
  {
    "key": "care_team.primary_care_physician",
    "label": "Primary care physician",
    "group": "Care team",
    "clinical": true
  },
  {
    "key": "care_team.referring_transferring_facility",
    "label": "Referring / transferring facility",
    "group": "Care team",
    "clinical": true
  },
  {
    "key": "care_team.hospital_service",
    "label": "Hospital service",
    "group": "Care team",
    "clinical": true
  },
  {
    "key": "clinical.admit_diagnosis",
    "label": "Admit diagnosis",
    "group": "Clinical",
    "clinical": true
  },
  {
    "key": "clinical.visit_reason",
    "label": "Visit reason",
    "group": "Clinical",
    "clinical": true
  },
  {
    "key": "clinical.principal_diagnosis",
    "label": "Principal diagnosis",
    "group": "Clinical",
    "clinical": true
  },
  {
    "key": "clinical.other_diagnoses",
    "label": "Other diagnoses",
    "group": "Clinical",
    "clinical": true
  },
  {
    "key": "clinical.principal_procedure",
    "label": "Principal procedure",
    "group": "Clinical",
    "clinical": true
  },
  {
    "key": "clinical.other_procedures",
    "label": "Other procedures",
    "group": "Clinical",
    "clinical": true
  },
  {
    "key": "clinical.icd_codes",
    "label": "ICD codes",
    "group": "Clinical",
    "clinical": true
  },
  {
    "key": "insurance.insurer",
    "label": "Insurer",
    "group": "Insurance",
    "clinical": true
  },
  {
    "key": "facility.facility",
    "label": "Facility",
    "group": "Facility",
    "clinical": true
  },
  {
    "key": "appointments.next_md_visit",
    "label": "Next MD Visit",
    "group": "Appointments",
    "clinical": true
  },
  {
    "key": "vitals.height",
    "label": "Height",
    "group": "Vitals",
    "clinical": true
  },
  {
    "key": "vitals.weight",
    "label": "Weight",
    "group": "Vitals",
    "clinical": true
  },
  {
    "key": "vitals.bsa",
    "label": "BSA",
    "group": "Vitals",
    "clinical": true
  },
  {
    "key": "vitals.height_weight_bsa",
    "label": "Height/Weight/BSA",
    "group": "Vitals",
    "clinical": true
  }
] as const;
