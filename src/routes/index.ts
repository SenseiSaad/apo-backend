import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import patientRoutes from '../modules/patient/patient.routes';
import activitiesRoutes from '../modules/activities/activities.routes';
import chatRoutes from '../modules/chat/chat.routes';
import adminRoutes from '../modules/admin/admin.routes';
import DoctorRoutes from '../modules/doctor/doctor.routes';
import AssistantRoutes from '../modules/assistant/assistant.routes';
import streamojiRoutes from '../modules/streamoji/streamoji.routes';
import avatarLibraryRoutes from '../modules/avatarLibrary/avatarLibrary.routes';
import avatarViewerRoutes from '../modules/avatarViewer/avatarViewer.routes';

const router = Router();

// API Version info
router.get('/', (_req, res) => {
    res.json({
        name: 'Apothecary API',
        version: '1.0.0',
        status: 'running',
        description: 'HIPAA-Compliant Clinic Platform'
    });
});

// Auth routes (public + protected)
router.use('/auth', authRoutes);

// Patient routes (protected - patient role only)
router.use('/patient', patientRoutes);

// Activities routes (protected - patient role + basic/premium tier)
router.use('/activities', activitiesRoutes);

// Chat routes (protected - patient role only)
router.use('/chat', chatRoutes);

// Admin routes
router.use('/admin', adminRoutes);

// Doctor routes (protected - Doctor role only)
router.use('/doctor', DoctorRoutes);

// Assistant routes (protected - Assistant role only)
router.use('/assistant', AssistantRoutes);

// Streamoji avatar auth/token routes
router.use('/streamoji', streamojiRoutes);

// Streamoji-backed patient avatar library
router.use('/avatar-library', avatarLibraryRoutes);

// Hosted avatar viewer session routes
router.use('/avatar-viewer', avatarViewerRoutes);
// TODO: Add more routes as modules are built
// router.use('/sessions', authenticate, sessionRoutes);
// router.use('/content', authenticate, contentRoutes);
// router.use('/notifications', authenticate, notificationRoutes);


export default router;
