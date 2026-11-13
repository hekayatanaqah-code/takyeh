"use strict";

async function sendTaqnyatOTP(phone, otpCode) {
    const apiKey = process.env.TAQNYAT_API_KEY; 

    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '966' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('966')) {
        formattedPhone = '966' + formattedPhone;
    }

    try {
        console.log(`إرسال قالب الواتساب للرقم: ${formattedPhone} برمز: ${otpCode}`);
        
        // استخدام الرابط الصحيح والمعتمد لبوابة تقنيات
        const response = await fetch("https://api.taqnyat.sa/v1/messages", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                recipients: [formattedPhone],
                body: `رمز التحقق الخاص بك في منصة تكية هو: ${otpCode}`,
                sender: "Takyeh"
            })
        });

        // التحقق مما إذا كان الرد عبارة عن JSON صحيح أم لا
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const textResponse = await response.text();
            console.error("خطأ: تقنيات أرجعت رد غير نصي/HTML:", textResponse);
            return { success: false, error: "بوابة تقنيات أرجعت صفحة خطأ وليست بيانات" };
        }

        const data = await response.json();
        console.log("رد منصة تقنية الفعلي:", JSON.stringify(data, null, 2));

        if (response.ok) {
            return { success: true, data };
        } else {
            return { success: false, error: data.message || "فشل إرسال الرسالة من تقنيات" };
        }
    } catch (error) {
        console.error("خطأ استثنائي في الاتصال ببوابة تقنية:", error);
        return { success: false, error: error.message };
    }
}

module.exports = { sendTaqnyatOTP };
