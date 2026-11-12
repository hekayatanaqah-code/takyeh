"use strict";

async function sendTaqnyatOTP(phone, otpCode) {
    const apiKey = process.env.TAQNYAT_API_KEY || "YOUR_API_KEY_HERE"; 
    const senderName = process.env.TAQNYAT_SENDER || "Takyah"; 

    // تنسيق رقم الهاتف (إزالة أي رموز زائدة والتأكد من البدء برمز الدولة 966)
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '966' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('966')) {
        formattedPhone = '966' + formattedPhone;
    }

    try {
        console.log(`محاولة إرسال واتساب للرقم: ${formattedPhone} برمز: ${otpCode}`);
        
        // جرب مسار الواتساب المعتمد في تقنية، وفي حال اختلف المسار يظهر لنا في الخطأ
        const response = await fetch("https://api.taqnyat.sa/v1/whatsapp/messages", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                recipients: [formattedPhone],
                sender: senderName,
                body: `رمز التحقق الخاص بك في منصة تكية هو: ${otpCode}`
            })
        });

        const data = await response.json();
        console.log("استجابة منصة تقنية:", data);

        if (response.ok) {
            return { success: true, data };
        } else {
            console.error("خطأ من تقنيات:", data);
            return { success: false, error: data.message || "فشل إرسال الرسالة من تقنيات" };
        }
    } catch (error) {
        console.error("خطأ في الاتصال:", error);
        return { success: false, error: error.message };
    }
}

module.exports = { sendTaqnyatOTP };
