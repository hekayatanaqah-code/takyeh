import re

with open('artifacts/chalet-marketplace/src/pages/Admin.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix softDeleteOwner
content = content.replace(
    'const softDeleteOwner = useMutation({\n    mutationFn: async ({ id, adminNote }: { id: string; adminNote?: string }) => {\n      const r = await apiFetch(`/admin/owners/${id}/soft-delete`, {\n        method: "POST",\n        body: JSON.stringify({ adminNote }),\n      });',
    'const softDeleteOwner = useMutation({\n    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {\n      const r = await apiFetch(`/admin/owners/${id}/soft-delete`, {\n        method: "PATCH",\n        body: JSON.stringify({ reason }),\n      });'
)

# Fix modal
content = content.replace(
    '<SoftDeleteOwnerModal\n          ownerName={deleteOwnerTarget.name}\n          open={true}\n          onClose={() => setDeleteOwnerTarget(null)}\n          onConfirm={(reason) => softDeleteOwner.mutate({ id: deleteOwnerTarget.id, adminNote: reason })}\n          isLoading={softDeleteOwner.isPending}\n        />',
    '<DeleteSafeModal\n          target={deleteOwnerTarget}\n          entityLabel="المالك"\n          isLoading={softDeleteOwner.isPending}\n          onClose={() => setDeleteOwnerTarget(null)}\n          onConfirm={(reason: string) => softDeleteOwner.mutate({ id: deleteOwnerTarget.id, reason })}\n        />'
)

with open('artifacts/chalet-marketplace/src/pages/Admin.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
