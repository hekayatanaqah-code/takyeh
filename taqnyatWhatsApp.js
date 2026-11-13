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
        console.log(`محاولة إرسال عبر مسار تقنيات البديل للرقم: ${formattedPhone} بررمز: ${otpCode}`);
        
        // تجربة المسار العام المعتمد لدى تقنيات للرسائل والواتساب
        const response = await fetch("https://api.taqnyat.sa/v1/messages", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                sender: "Takyeh",
                recipients: [formattedPhone],
                body: `رمز التحقق الخاص بك في منصة تكية هو: ${otpCode}`
            })
        });

        const textResponse = await response.text();
        console.log("النص الخام الراجع من تقنيات:", textResponse);

        let data;
        try {
            data = JSON.parse(textResponse);
        } catch (e) {
            console.error("الرد ليس JSON صحيح:", textResponse);
            return { success: false, error: "بوابة تقنيات أرجعت استجابة غير صالحة" };
        }

        if (response.ok && (data.statusCode === 201 || data.statusCode === 200 || data.status === 'success' || data.success)) {
            return { success: true, data };
        } else {
            return { success: false, error: data.message || "فشل إرسال الرسالة من تقنيات" };
        }
    } catch (error) {
        console.error("خطأ استثنائي:", error);
        return { success: false, error: error.message };
    }
}

module.exports = { sendTaqnyatOTP };
