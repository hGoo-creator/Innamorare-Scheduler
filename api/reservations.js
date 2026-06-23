export default async function handler(req, res) {
  let kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    return res.status(500).json({ error: "Missing KV environment variables. Please check Vercel settings." });
  }
  
  // Remove trailing slash if exists
  if (kvUrl.endsWith('/')) {
    kvUrl = kvUrl.slice(0, -1);
  }

  // GET Requests
  if (req.method === 'GET') {
    const action = req.query.action || 'getReservations';

    if (action === 'getSettings') {
      try {
        const response = await fetch(`${kvUrl}/get/innamorare_settings`, {
          headers: { Authorization: `Bearer ${kvToken}` }
        });
        const data = await response.json();
        
        // Default Settings
        let settings = {
          adminPassword: "0203",
          notice: "",
          inquiry: "",
          directions: "",
          price1f: 77000,
          price2f: 77000,
          priceAll: 132000,
          priceExtra: 5500
        };

        if (data && data.result) {
          try {
            const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
            settings = { ...settings, ...parsed };
          } catch(e) {}
        }
        return res.status(200).json({ settings });
      } catch (err) {
        return res.status(500).json({ error: "Failed to fetch settings from KV" });
      }
    } else {
      // getReservations
      try {
        const response = await fetch(`${kvUrl}/get/innamorare_reservations`, {
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
        return res.status(500).json({ error: "Failed to fetch reservations from KV" });
      }
    }
  }

  // POST Requests
  if (req.method === 'POST') {
    try {
      let incomingData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const action = incomingData.action;

      if (action === 'saveSettings') {
        const settingsToSave = incomingData.settings;
        if (!settingsToSave) return res.status(400).json({ error: "Settings data missing" });
        
        const saveResponse = await fetch(`${kvUrl}/set/innamorare_settings`, {
          method: 'POST',
          headers: { 
            Authorization: `Bearer ${kvToken}`, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify(settingsToSave)
        });

        if (!saveResponse.ok) {
          const errText = await saveResponse.text();
          throw new Error("KV SET operation failed: " + errText);
        }
        return res.status(200).json({ success: true, message: "Settings saved successfully." });
      } 
      
      if (action === 'saveReservations') {
        const reservationsToSave = incomingData.reservations;
        if (!Array.isArray(reservationsToSave)) {
          return res.status(400).json({ error: "Invalid data format. Expected an array." });
        }

        // Server-side Double Validation for Overlaps
        const validReservations = [];
        for (const r of reservationsToSave) {
          // Check overlap against already validated items
          const overlap = validReservations.find(ex => 
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

        const saveResponse = await fetch(`${kvUrl}/set/innamorare_reservations`, {
          method: 'POST',
          headers: { 
            Authorization: `Bearer ${kvToken}`, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify(validReservations)
        });

        if (!saveResponse.ok) {
          const errText = await saveResponse.text();
          throw new Error("KV SET operation failed: " + errText);
        }
        return res.status(200).json({ success: true, message: "Reservations saved successfully." });
      }

      return res.status(400).json({ error: "Invalid action specified in POST request." });
    } catch (err) {
      console.error("POST Error:", err);
      return res.status(500).json({ error: "Failed to save to KV", details: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
