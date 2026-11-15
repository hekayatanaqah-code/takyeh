"use strict";

function isTaqnyatAccepted(httpOk, data) {
    if (!httpOk || !data || typeof data !== "object" || data.error || data.errors || data.success === false) {
        return false;
    }
    if (["failed", "failure", "error", "rejected"].includes(String(data.status || "").toLowerCase())) {
        return false;
    }
    if (Number(data.statusCode) >= 400) return false;
    // Live Taqnyat template replies use {type:"template", statuses:{message_id,...}}.
    // The documented WhatsApp reply uses {type:"whatsapp", statuses:[...]}.
    if (["whatsapp", "template"].includes(data.type) && data.statuses != null) {
        const statuses = Array.isArray(data.statuses) ? data.statuses : [data.statuses];
        return statuses.length > 0 && statuses.every(item =>
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

function normalizeTaqnyatPhone(phone) {
    let digits = String(phone || "")
        .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
        .replace(/\D/g, "");
    if (digits.startsWith("00966")) digits = digits.slice(2);
    if (/^05\d{8}$/.test(digits)) digits = "966" + digits.slice(1);
    else if (/^5\d{8}$/.test(digits)) digits = "966" + digits;
    return /^9665\d{8}$/.test(digits) ? digits : null;
}

// Transactional notices require their own approved utility templates, not the OTP template.
async function sendTaqnyatTemplate(phone, name, parameters, language = "ar") {
    const to = normalizeTaqnyatPhone(phone);
    if (!to) return { success: false, error: "invalid_phone" };
    if (!process.env.TAQNYAT_API_KEY || !name) return { success: false, error: "not_configured" };
    try {
        const response = await fetch("https://api.taqnyat.sa/wa/v2/messages/", {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: {
                Authorization: `Bearer ${process.env.TAQNYAT_API_KEY}`,
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({
                to, type: "template",
                template: {
                    name, language: { code: language },
                    components: [{ type: "body", parameters: parameters.map(text => ({ type: "text", text: String(text) })) }]
                }
            })
        });
        const data = await response.json();
        return isTaqnyatAccepted(response.ok, data)
            ? { success: true }
            : { success: false, error: "provider_rejected" };
    } catch (_) {
        return { success: false, error: "provider_unavailable" };
    }
}

module.exports = { sendTaqnyatOTP, isTaqnyatAccepted, normalizeTaqnyatPhone, sendTaqnyatTemplate };
