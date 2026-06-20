import express from 'express';

import { SecretName, secretsService } from '#services/secrets-service';
import { requestLoggerMiddleware } from '#util/middlewares';

const app = express();

app.use(express.json());
app.use(requestLoggerMiddleware);

app.get('/depreciation', async (req, res) => {
  const { vin, mileage } = req.query;
  const apiKey = req.headers['x-rapidapi-key'];

  if (!vin || !mileage || !apiKey) {
    return res.status(400).send({
      status: 'error',
      reason: 'Missing required query parameters (vin, mileage) or API key',
    });
  }

  try {
    // 1. Resolve VIN to vehicleId
    const vinUrl = `https://autohub1.p.rapidapi.com/api/v1/vehicles/vin?vin=${encodeURIComponent(vin as string)}`;
    const vinRes = await fetch(vinUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': apiKey as string,
        'x-rapidapi-host': 'autohub1.p.rapidapi.com',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!vinRes.ok) {
      return res
        .status(vinRes.status)
        .send({ status: 'error', reason: await vinRes.text() });
    }

    const vinData = (await vinRes.json()) as { body?: { vehicle_id?: string } };
    const vehicleId = vinData?.body?.vehicle_id;

    if (!vehicleId) {
      return res.status(404).send({
        status: 'error',
        reason: 'Could not find vehicle ID for this VIN',
      });
    }

    // 2. Fetch Depreciation Data
    const depreciationUrl = `https://autohub1.p.rapidapi.com/api/v1/vehicles/depreciation?vehicleId=${vehicleId}&mileage=${encodeURIComponent(mileage as string)}`;
    const depRes = await fetch(depreciationUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': apiKey as string,
        'x-rapidapi-host': 'autohub1.p.rapidapi.com',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!depRes.ok) {
      return res
        .status(depRes.status)
        .send({ status: 'error', reason: await depRes.text() });
    }

    const depData = await depRes.json();
    return res.send(depData);
  } catch (error) {
    console.error('Failed to fetch from Autohub:', error);
    return res
      .status(500)
      .send({ status: 'error', reason: 'Failed to fetch from Autohub' });
  }
});

app.post('/status', async (req, res) => {
  const token = secretsService.get(SecretName.autohub_apiKey);
  const configured = token != null && token !== 'Forbidden';

  res.send({
    status: 'ok',
    data: {
      configured,
    },
  });
});

export const handlers = app;
