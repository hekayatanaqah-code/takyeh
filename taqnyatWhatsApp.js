"use strict";

async function sendTaqnyatOTP(phone, otpCode) {
    const apiKey = process.env.TAQNYAT_API_KEY; 

    // تنسيق رقم الهاتف (بدون علامة زائد ويبدأ بـ 966)
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '966' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('966')) {
        formattedPhone = '966' + formattedPhone;
    }

    try {
        console.log(`إرسال قالب الواتساب للرقم: ${formattedPhone} برمز: ${otpCode}`);
        
        const response = await fetch("https://api.taqnyat.sa/v1/whatsapp/messages", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                recipients: [formattedPhone],
                templateName: "otp_verification",
                bodyParams: [otpCode]
            })
        });

        const data = await response.json();
        
        console.log("========================================");
        console.log("رد منصة تقنية الفعلي:", JSON.stringify(data, null, 2));
        console.log("========================================");

        if (response.ok && (data.statusCode === 201 || data.statusCode === 200 || data.status === 'success' || data.success)) {
            return { success: true, data };
        } else {
            console.error("رفض من منصة تقنية:", data);
            return { success: false, error: data.message || "فشل إرسال الرسالة من تقنيات" };
        }
    } catch (error) {
        console.error("خطأ استثنائي في الاتصال ببوابة تقنية:", error);
        return { success: false, error: error.message };
    }
}

module.exports = { sendTaqnyatOTP };
