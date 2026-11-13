"use strict";

function isTaqnyatAccepted(httpOk, data) {
    if (!httpOk || !data || typeof data !== "object" || data.error || data.errors || data.success === false) {
        return false;
    }
    if (["failed", "failure", "error", "rejected"].includes(String(data.status || "").toLowerCase())) {
        return false;
    }
    // WhatsApp v2 acknowledges accepted messages using statuses[].message_id,
    // not the statusCode/success fields used by other Taqnyat APIs.
    if (data.type === "whatsapp" && Array.isArray(data.statuses)) {
        return data.statuses.length > 0 && data.statuses.every(item =>
            item && typeof item.message_id === "string" && item.message_id.trim().length > 0 &&
            !item.error && !item.errors &&
            !["failed", "failure", "error", "rejected"].includes(String(item.status || item.state || "").toLowerCase())
        );
    }
    return [200, 201].includes(Number(data.statusCode)) || data.status === "success" || data.success === true;
}

async function sendTaqnyatOTP(phone, otpCode) {
    const apiKey = process.env.TAQNYAT_API_KEY; 

    if (!apiKey) return { success: false, error: "خدمة إرسال رمز التحقق غير مهيأة" };
    if (!/^\d{4}$/.test(String(otpCode))) return { success: false, error: "رمز التحقق غير صالح" };
    let formattedPhone = String(phone).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '966' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('966')) {
        formattedPhone = '966' + formattedPhone;
    }

    try {
        // استخدام مسار الواتساب المعتمد والمحدث من القسم التقني
        const response = await fetch("https://api.taqnyat.sa/wa/v2/messages/", {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                "to": `+${formattedPhone}`,
                "type": "template",
                "template": {
                    "name": "otp_verification",
                    "language": {
                        "code": "ar"
                    },
                    "components": [
                        {
                            "type": "body",
                            "parameters": [
                                {
                                    "type": "text",
                                    "text": String(otpCode)
                                }
                            ]
                        },
                        {
                            "type": "button",
                            "sub_type": "url",
                            "index": "0",
                            "parameters": [
                                {
                                    "type": "text",
                                    "text": String(otpCode)
                                }
                            ]
                        }
                    ]
                }
            })
        });

        const textResponse = await response.text();

        let data;
        try {
            data = JSON.parse(textResponse);
        } catch (e) {
            return { success: false, error: "بوابة تقنيات أرجعت استجابة غير صالحة" };
        }

        if (isTaqnyatAccepted(response.ok, data)) {
            return { success: true, data };
        } else {
            return { success: false, error: "فشل إرسال الرسالة من تقنيات" };
        }
    } catch (error) {
        return { success: false, error: "تعذّر الاتصال بخدمة إرسال رمز التحقق" };
    }
}

module.exports = { sendTaqnyatOTP, isTaqnyatAccepted };
