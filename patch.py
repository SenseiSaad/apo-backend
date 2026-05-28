import re

with open('src/modules/patient/patient.service.ts', 'r') as f:
    text = f.read()

text = text.replace(
    "import { InviteToken } from '../../models/InviteToken.model';",
    "import { InviteToken } from '../../models/InviteToken.model';\nimport { CareRequest } from '../../models/CareRequest.model';"
)

text = text.replace(
    """        // Calculate streak status
        const streak_status = this.calculateStreakStatus(patient);

        return {
            patient_id: patient._id.toString(),""",
    """        // Calculate streak status
        const streak_status = this.calculateStreakStatus(patient);

        const active_request = await CareRequest.findOne({ patient_id, status: { $in: ['new_request', 'triage_claimed', 'triage_in_progress', 'pending_assignment', 'assigned', 'in_treatment', 'follow_up_needed', 'patient_requested_closure'] } });

        return {
            patient_id: patient._id.toString(),
            active_care_request_id: active_request ? active_request._id.toString() : null,"""
)

with open('src/modules/patient/patient.service.ts', 'w') as f:
    f.write(text)

print("Patched patient.service.ts")
