import { Router } from 'express';
import { authenticate, adminOnly, allRoles } from '../middleware/auth';
import { prisma } from '../config/prisma';
import { generateBrandingConfig } from '../services/brandingService';

const router = Router();

router.use(authenticate);

// GET /api/branding/:provider — get or generate branding for a provider type
router.get('/:provider', allRoles, async (req, res) => {
  try {
    const config = await generateBrandingConfig(req.params.provider.toUpperCase());
    res.json({ branding: config });
  } catch (err: any) {
    res.status(500).json({ error: 'BRANDING_FAILED', message: err.message });
  }
});

// GET /api/branding — list all branding configs
router.get('/', allRoles, async (_req, res) => {
  const configs = await prisma.brandingConfig.findMany({ orderBy: { providerType: 'asc' } });
  res.json({ brandings: configs });
});

// DELETE /api/branding/:provider — reset branding so it regenerates
router.delete('/:provider', adminOnly, async (req, res) => {
  await prisma.brandingConfig.deleteMany({ where: { providerType: req.params.provider.toUpperCase() } });
  res.json({ message: 'Branding config reset — will regenerate on next request' });
});

export default router;
