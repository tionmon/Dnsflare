const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'
const SUPPORTED_TYPES = new Set(['A', 'AAAA', 'CNAME'])

class ApiError extends Error {
    constructor(status, code, message, details) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.code = code
        this.details = details
    }
}

function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload, null, 2), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    })
}

function normalizeRecordName(value) {
    const name = String(value ?? '')
        .trim()
        .replace(/\.+$/, '')
        .toLowerCase()

    if (!name || name.length > 253 || /\s|\//.test(name) || name.includes('://')) {
        throw new ApiError(400, 'INVALID_NAME', 'DNS record name is invalid')
    }

    const zoneName = name.startsWith('*.') ? name.slice(2) : name
    if (!zoneName.includes('.') || zoneName.startsWith('.') || zoneName.endsWith('.')) {
        throw new ApiError(400, 'INVALID_NAME', 'Please use a full DNS name, for example test.example.com')
    }

    return name
}

function isIPv4(value) {
    const parts = value.split('.')
    if (parts.length !== 4) return false

    return parts.every((part) => {
        if (!/^\d{1,3}$/.test(part)) return false
        const number = Number(part)
        return number >= 0 && number <= 255 && String(number) === part.replace(/^0+(?=\d)/, '')
    })
}

function isIPv6(value) {
    if (!value.includes(':') || !/^[0-9a-fA-F:.]+$/.test(value)) return false

    try {
        const url = new URL(`http://[${value}]/`)
        return Boolean(url.hostname)
    } catch {
        return false
    }
}

function normalizeContent(type, value) {
    const content = String(value ?? '').trim()
    if (!content || /\s/.test(content)) {
        throw new ApiError(400, 'INVALID_CONTENT', 'DNS record content is invalid')
    }

    if (type === 'A' && !isIPv4(content)) {
        throw new ApiError(400, 'INVALID_IPV4', `${content} is not a valid IPv4 address`)
    }

    if (type === 'AAAA' && !isIPv6(content)) {
        throw new ApiError(400, 'INVALID_IPV6', `${content} is not a valid IPv6 address`)
    }

    if (type === 'CNAME') {
        const target = content.replace(/\.+$/, '').toLowerCase()
        if (!target || target.includes('://') || /\s|\//.test(target)) {
            throw new ApiError(400, 'INVALID_CNAME', `${content} is not a valid CNAME target`)
        }
        return target
    }

    return content
}

function parseBoolean(value) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value !== 'string') return false
    return ['1', 'true', 'yes', 'on', 'cf', 'proxied'].includes(value.trim().toLowerCase())
}

async function parseCommand(request) {
    const contentType = request.headers.get('Content-Type') ?? ''
    let raw

    if (contentType.toLowerCase().includes('application/json')) {
        try {
            raw = await request.json()
        } catch {
            throw new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON')
        }

        const type = String(raw?.type ?? '').trim().toUpperCase()
        if (!SUPPORTED_TYPES.has(type)) {
            throw new ApiError(400, 'UNSUPPORTED_TYPE', 'Only A, AAAA and CNAME are supported')
        }

        const name = normalizeRecordName(raw?.name ?? raw?.hostname)
        const content = normalizeContent(type, raw?.content ?? raw?.value)
        const proxied = parseBoolean(raw?.proxied ?? raw?.cf)
        return { content, type, name, proxied }
    }

    const body = (await request.text()).trim()
    const parts = body.split(/\s+/).filter(Boolean)
    if (parts.length < 3 || parts.length > 4) {
        throw new ApiError(
            400,
            'INVALID_COMMAND',
            'Command format: <content> <A|AAAA|CNAME> <name> [cf]',
        )
    }

    const [rawContent, rawType, rawName, rawFlag] = parts
    const type = rawType.toUpperCase()
    if (!SUPPORTED_TYPES.has(type)) {
        throw new ApiError(400, 'UNSUPPORTED_TYPE', 'Only A, AAAA and CNAME are supported')
    }

    if (rawFlag && rawFlag.toLowerCase() !== 'cf') {
        throw new ApiError(400, 'UNKNOWN_FLAG', `Unknown flag: ${rawFlag}. Only "cf" is supported`)
    }

    const name = normalizeRecordName(rawName)
    const content = normalizeContent(type, rawContent)
    const proxied = rawFlag?.toLowerCase() === 'cf'
    return { content, type, name, proxied }
}

function readClientKey(request) {
    const direct = request.headers.get('X-Dnsflare-Key')?.trim()
    if (direct) return direct

    const authorization = request.headers.get('Authorization')?.trim() ?? ''
    if (/^Bearer\s+/i.test(authorization)) {
        return authorization.replace(/^Bearer\s+/i, '').trim()
    }

    return ''
}

function constantTimeEqual(left, right) {
    const a = String(left ?? '')
    const b = String(right ?? '')
    if (a.length !== b.length || a.length === 0) return false

    let result = 0
    for (let index = 0; index < a.length; index += 1) {
        result |= a.charCodeAt(index) ^ b.charCodeAt(index)
    }
    return result === 0
}

function requireConfiguration(env) {
    const apiKey = env.DNSFLARE_API_KEY
    const cloudflareToken = env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN

    if (!apiKey) {
        throw new ApiError(500, 'SERVER_NOT_CONFIGURED', 'DNSFLARE_API_KEY is not configured')
    }
    if (!cloudflareToken) {
        throw new ApiError(500, 'SERVER_NOT_CONFIGURED', 'CF_API_TOKEN is not configured')
    }

    return { apiKey, cloudflareToken }
}

async function cloudflareRequest(cloudflareToken, path, init = {}) {
    const headers = new Headers(init.headers ?? {})
    headers.set('Authorization', `Bearer ${cloudflareToken}`)
    headers.set('Accept', 'application/json')
    if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
    }

    let response
    try {
        response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
            ...init,
            headers,
        })
    } catch (error) {
        throw new ApiError(502, 'CLOUDFLARE_UNREACHABLE', 'Unable to reach Cloudflare API', {
            message: error instanceof Error ? error.message : String(error),
        })
    }

    let data
    try {
        data = await response.json()
    } catch {
        throw new ApiError(502, 'CLOUDFLARE_INVALID_RESPONSE', 'Cloudflare returned a non-JSON response')
    }

    if (!response.ok || data?.success === false) {
        const message = data?.errors?.[0]?.message || `Cloudflare API request failed with HTTP ${response.status}`
        const status = response.status >= 400 && response.status < 500 ? response.status : 502
        throw new ApiError(status, 'CLOUDFLARE_API_ERROR', message, {
            status: response.status,
            errors: data?.errors ?? [],
        })
    }

    return data
}

function buildZoneCandidates(recordName) {
    const baseName = recordName.startsWith('*.') ? recordName.slice(2) : recordName
    const labels = baseName.split('.').filter(Boolean)
    const candidates = []

    for (let index = 0; index < labels.length - 1; index += 1) {
        candidates.push(labels.slice(index).join('.'))
    }

    return candidates
}

async function findZone(cloudflareToken, recordName) {
    for (const candidate of buildZoneCandidates(recordName)) {
        const data = await cloudflareRequest(
            cloudflareToken,
            `/zones?name=${encodeURIComponent(candidate)}&per_page=1`,
        )
        const zone = data?.result?.find(
            (item) => String(item?.name ?? '').toLowerCase() === candidate.toLowerCase(),
        )
        if (zone) return zone
    }

    throw new ApiError(404, 'ZONE_NOT_FOUND', `No Cloudflare zone was found for ${recordName}`)
}

function detectConflict(records, requestedType) {
    if (requestedType === 'CNAME') {
        return records.find((record) => ['A', 'AAAA'].includes(record.type))
    }

    if (requestedType === 'A' || requestedType === 'AAAA') {
        return records.find((record) => record.type === 'CNAME')
    }

    return undefined
}

async function upsertRecord(cloudflareToken, zone, command) {
    const recordData = await cloudflareRequest(
        cloudflareToken,
        `/zones/${zone.id}/dns_records?name=${encodeURIComponent(command.name)}&per_page=100`,
    )
    const records = Array.isArray(recordData?.result) ? recordData.result : []
    const sameType = records.filter((record) => record.type === command.type)

    if (sameType.length > 1) {
        throw new ApiError(
            409,
            'MULTIPLE_RECORDS',
            `${command.name} has ${sameType.length} ${command.type} records. Refusing to choose one automatically`,
            { recordIds: sameType.map((record) => record.id) },
        )
    }

    if (sameType.length === 0) {
        const conflict = detectConflict(records, command.type)
        if (conflict) {
            throw new ApiError(
                409,
                'RECORD_CONFLICT',
                `${command.name} already has a conflicting ${conflict.type} record`,
                { recordId: conflict.id, recordType: conflict.type },
            )
        }
    }

    const payload = {
        type: command.type,
        name: command.name,
        content: command.content,
        ttl: 1,
        proxied: command.proxied,
    }

    if (sameType.length === 1) {
        const existing = sameType[0]
        const updated = await cloudflareRequest(
            cloudflareToken,
            `/zones/${zone.id}/dns_records/${existing.id}`,
            {
                method: 'PATCH',
                body: JSON.stringify(payload),
            },
        )
        return { action: 'updated', record: updated.result }
    }

    const created = await cloudflareRequest(cloudflareToken, `/zones/${zone.id}/dns_records`, {
        method: 'POST',
        body: JSON.stringify(payload),
    })
    return { action: 'created', record: created.result }
}

function helpResponse() {
    return jsonResponse({
        name: 'Dnsflare Remote API',
        endpoint: 'POST /command',
        authentication: 'X-Dnsflare-Key: <DNSFLARE_API_KEY> or Authorization: Bearer <DNSFLARE_API_KEY>',
        syntax: '<content> <A|AAAA|CNAME> <name> [cf]',
        examples: [
            '1.1.1.1 a test.example.com',
            '1.1.1.1 a test.example.com cf',
            '2606:4700:4700::1111 aaaa ipv6.example.com',
            'origin.example.net cname www.example.com cf',
        ],
    })
}

export async function onRequest(context) {
    const { request, env } = context

    if (request.method === 'GET') return helpResponse()
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
    if (request.method !== 'POST') {
        return jsonResponse(
            { success: false, error: 'METHOD_NOT_ALLOWED', message: 'Use POST /command' },
            405,
        )
    }

    try {
        const { apiKey, cloudflareToken } = requireConfiguration(env)
        const clientKey = readClientKey(request)
        if (!constantTimeEqual(clientKey, apiKey)) {
            throw new ApiError(401, 'UNAUTHORIZED', 'Invalid or missing Dnsflare API key')
        }

        const command = await parseCommand(request)
        const zone = await findZone(cloudflareToken, command.name)
        const result = await upsertRecord(cloudflareToken, zone, command)

        return jsonResponse({
            success: true,
            action: result.action,
            zone: {
                id: zone.id,
                name: zone.name,
            },
            record: {
                id: result.record?.id,
                type: result.record?.type ?? command.type,
                name: result.record?.name ?? command.name,
                content: result.record?.content ?? command.content,
                ttl: result.record?.ttl ?? 1,
                proxied: result.record?.proxied ?? command.proxied,
            },
        })
    } catch (error) {
        if (error instanceof ApiError) {
            return jsonResponse(
                {
                    success: false,
                    error: error.code,
                    message: error.message,
                    ...(error.details ? { details: error.details } : {}),
                },
                error.status,
            )
        }

        console.error('Unhandled /command error', error)
        return jsonResponse(
            { success: false, error: 'INTERNAL_ERROR', message: 'Unexpected server error' },
            500,
        )
    }
}
