export interface ValidationIssue {
    path: PropertyKey[]
    code: string
    message: string
}

export interface ValidationDetails {
    issues: ValidationIssue[]
}

export function validationDetails(error: {
    issues: readonly { path: readonly PropertyKey[]; code: string; message: string }[]
}): ValidationDetails {
    return {
        issues: error.issues.map((issue) => ({
            path: [...issue.path],
            code: issue.code,
            message: issue.message,
        })),
    }
}
