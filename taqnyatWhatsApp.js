const axios = require('axios');

async function sendTaqnyatOTP(recipient, otpCode) {
    const token = process.env.TAQNYAT_BEARER_TOKEN;
    if (!token) {
        console.error("TAQNYAT_BEARER_TOKEN is not set in environment variables");
        return { success: false, error: "Token missing" };
    }

    try {
        const response = await axios.post(
            'https://api.taqnyat.sa/wa/v1/send/template', 
            {
                phone: recipient,
                templateName: 'otp_verification',
                parameters: [otpCode]
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('OTP WhatsApp sent successfully:', response.data);
        return { success: true, data: response.data };
    } catch (error) {
        console.error('Error sending Taqnyat OTP:', error.response?.data || error.message);
        return { success: false, error: error.response?.data || error.message };
    }
}

module.exports = { sendTaqnyatOTP };
