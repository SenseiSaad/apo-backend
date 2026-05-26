const fs = require('fs');
let content = fs.readFileSync('src/modules/doctor/doctor.service.ts', 'utf8');

const importReplacement = `import { adminService } from '../admin/admin.service';
import { SessionBooking } from '../../models/SessionBooking.model';
import { toZonedTime, formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { addMinutes, isAfter } from 'date-fns';
import {
    GenerateDoctorSlotsInput,
    GetDoctorSlotsQueryInput,
    CreateDoctorAssistantInput,`;
content = content.replace(
    `import { adminService } from '../admin/admin.service';
import {
    CreateDoctorAssistantInput,`,
    importReplacement
);

const methodInsertion = `
    async generateSlots(user_id: string, input: GenerateDoctorSlotsInput) {
        const doctor = await DoctorModel.findOne({ user_id });
        if (!doctor) throw new NotFoundError('Doctor profile not found');

        const tz = input.timezone || doctor.portal_settings?.timezone || 'UTC';
        const session_duration = doctor.portal_settings?.default_session_duration_mins || 50;
        const break_duration = 10; // 10 minutes between sessions
        const total_slot_duration = session_duration + break_duration;

        // Create start and end Dates based on the specific date and time in the given timezone
        const startTimeStr = \`\${input.date}T\${input.start_time}:00\`;
        const endTimeStr = \`\${input.date}T\${input.end_time}:00\`;

        const startZoned = fromZonedTime(startTimeStr, tz);
        const endZoned = fromZonedTime(endTimeStr, tz);

        if (!isAfter(endZoned, startZoned)) {
            throw new BadRequestError('End time must be after start time');
        }

        const slotsToCreate = [];
        let currentSlotStart = startZoned;
        
        while (true) {
            const currentSlotEnd = addMinutes(currentSlotStart, session_duration);
            if (isAfter(currentSlotEnd, endZoned)) {
                break; // This slot exceeds the end time
            }

            // Check if slot overlaps with existing booking
            const overlap = await SessionBooking.findOne({
                doctor_id: doctor._id,
                status: { $in: ['available', 'requested', 'pending', 'confirmed'] },
                $or: [
                    {
                        scheduled_at: { $lt: currentSlotEnd },
                        $expr: {
                            $gt: [
                                { $dateAdd: { startDate: "$scheduled_at", unit: "minute", amount: "$duration_mins" } },
                                currentSlotStart
                            ]
                        }
                    }
                ]
            });

            if (!overlap) {
                slotsToCreate.push({
                    doctor_id: doctor._id,
                    scheduled_at: currentSlotStart,
                    duration_mins: session_duration,
                    status: 'available',
                    mode: 'video'
                });
            }

            currentSlotStart = addMinutes(currentSlotStart, total_slot_duration);
        }

        if (slotsToCreate.length > 0) {
            await SessionBooking.insertMany(slotsToCreate);
        }

        return {
            generated_slots: slotsToCreate.length,
            date: input.date
        };
    }

    async getSlots(user_id: string, query: GetDoctorSlotsQueryInput) {
        const doctor = await DoctorModel.findOne({ user_id });
        if (!doctor) throw new NotFoundError('Doctor profile not found');

        const filter: any = { doctor_id: doctor._id };
        
        if (query.start_date || query.end_date) {
            filter.scheduled_at = {};
            if (query.start_date) {
                filter.scheduled_at.$gte = new Date(\`\${query.start_date}T00:00:00Z\`);
            }
            if (query.end_date) {
                filter.scheduled_at.$lte = new Date(\`\${query.end_date}T23:59:59Z\`);
            }
        }

        const slots = await SessionBooking.find(filter)
            .populate('patient_id', 'user_id full_name')
            .sort({ scheduled_at: 1 });

        return slots;
    }

    async getProfile(user_id: string) {`;

content = content.replace(
    `    async getProfile(user_id: string) {`,
    methodInsertion
);

fs.writeFileSync('src/modules/doctor/doctor.service.ts', content);
