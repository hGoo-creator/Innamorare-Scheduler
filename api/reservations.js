export default async function handler(req, res) {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    return res.status(500).json({ error: "Missing KV environment variables. Please check Vercel settings." });
  }

  // GET: Fetch reservations
  if (req.method === 'GET') {
    try {
      const response = await fetch(`${kvUrl}/get/reservations`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });
      const data = await response.json();
      
      let reservations = [];
      if (data && data.result) {
        try {
          reservations = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
        } catch(e) {
          reservations = data.result;
        }
      }
      return res.status(200).json({ reservations });
    } catch (err) {
      console.error("GET Error:", err);
      return res.status(500).json({ error: "Failed to fetch from KV", details: err.message });
    }
  }

  // POST: Validate and Save reservations
  if (req.method === 'POST') {
    try {
      let incomingData;
      if (typeof req.body === 'string') {
        incomingData = JSON.parse(req.body);
      } else {
        incomingData = req.body;
      }

      let reservationsToSave = incomingData;
      if (incomingData.action === 'saveReservations' && incomingData.reservations) {
        reservationsToSave = incomingData.reservations;
      }

      if (!Array.isArray(reservationsToSave)) {
        return res.status(400).json({ error: "Invalid data format. Expected an array of reservations." });
      }

      // Server-side Double Validation for Overlaps
      const validReservations = [];
      for (const r of reservationsToSave) {
        if (r.name === "SETTINGS_DATA") {
          validReservations.push(r);
          continue;
        }
        
        // Check overlap against already validated items
        const overlap = validReservations.find(ex => 
          ex.name !== "SETTINGS_DATA" &&
          ex.start_date === r.start_date && 
          ex.id !== r.id && 
          Math.max(r.start_hour, ex.start_hour) < Math.min(r.end_hour, ex.end_hour) && 
          (r.room === ex.room || r.room === '전체' || ex.room === '전체')
        );
        
        if (overlap) {
          return res.status(400).json({ 
            error: "Overlap detected in reservation data on server-side validation.",
            overlapDetails: r
          });
        }
        validReservations.push(r);
      }

      // Save to Vercel KV
      const saveResponse = await fetch(`${kvUrl}/set/reservations`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(validReservations)
      });

      if (!saveResponse.ok) {
        throw new Error("Vercel KV returned an error during SET operation");
      }

      return res.status(200).json({ success: true, message: "Reservations successfully saved." });
    } catch (err) {
      console.error("POST Error:", err);
      return res.status(500).json({ error: "Failed to save to KV", details: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
