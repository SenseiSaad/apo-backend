const fs = require('fs');
let content = fs.readFileSync('src/modules/doctor/doctor.controller.ts', 'utf8');
content = content.replace(
    `UpdateDoctorSettingsInput
} from '../../validators/doctor.validator';`,
    `UpdateDoctorSettingsInput,
    GenerateDoctorSlotsInput,
    GetDoctorSlotsQueryInput
} from '../../validators/doctor.validator';`
);
content = content.replace(
    `export class DoctorController {\n    async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {`,
    `export class DoctorController {
    async generateSlots(req: AuthRequest<any, any, GenerateDoctorSlotsInput, any>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await doctorService.generateSlots(req.user!.user_id, req.body);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getSlots(req: AuthRequest<any, any, any, GetDoctorSlotsQueryInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await doctorService.getSlots(req.user!.user_id, req.query);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {`
);
fs.writeFileSync('src/modules/doctor/doctor.controller.ts', content);
