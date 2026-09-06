import {
    DndContext,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
    KeyboardSensor,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GENERAL_CHAT_CHARACTER_ID, type Character, type CharacterGroup } from '@malang/shared'
import {
    ChatCircle,
    ChatsCircle,
    CircleNotch,
    Folder,
    FolderOpen,
    FolderPlus,
    GearSix,
    PencilSimple,
    Plus,
    Trash,
    UploadSimple,
    UserPlus,
} from '@phosphor-icons/react'
import { Fragment, type FormEvent, useState } from 'react'

import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import { CharacterAvatar } from '../character/character-avatar'
import {
    type CollectionNodeType,
    dropSlotId,
    groupCollisionDetection,
    groupNodeId,
    groupTargetId,
    groupedChildren,
    isCollectionDropTarget,
    itemNodeId,
    moveGroupedCollection,
    nodeTypeFromId,
    rootCollectionNodes,
} from '../groups/model'

export function CharacterRail({
    characters,
    groups,
    selectedId,
    busyCharacterIds,
    creating,
    mobileOpen,
    onHome,
    onSelect,
    onEdit,
    onDelete,
    onImport,
    onCreate,
    onCreateGroup,
    onRenameGroup,
    onDeleteGroup,
    onOrganize,
    onSettings,
}: {
    characters: Character[]
    groups: CharacterGroup[]
    selectedId: string | null
    busyCharacterIds: Set<string>
    creating: boolean
    mobileOpen: boolean
    onHome: () => void
    onSelect: (id: string) => void
    onEdit: (id: string) => void
    onDelete: (character: Character) => void
    onImport: () => void
    onCreate: () => void
    onCreateGroup: (name: string) => void | Promise<void>
    onRenameGroup: (id: string, name: string) => void | Promise<void>
    onDeleteGroup: (id: string) => void | Promise<void>
    onOrganize: (groups: CharacterGroup[], characters: Character[]) => void | Promise<void>
    onSettings: () => void
}) {
    const chatCharacter = characters.find((character) => character.id === GENERAL_CHAT_CHARACTER_ID)
    const customCharacters = characters.filter(
        (character) => character.id !== GENERAL_CHAT_CHARACTER_ID,
    )
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
        () => new Set(groups.map((group) => group.id)),
    )
    const [groupDialog, setGroupDialog] = useState<CharacterGroup | 'new' | null>(null)
    const [groupName, setGroupName] = useState('')
    const [activeType, setActiveType] = useState<CollectionNodeType | null>(null)
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor),
    )
    const rootNodes = rootCollectionNodes(groups, customCharacters)

    function toggleGroup(groupId: string) {
        setExpandedGroups((current) => {
            const next = new Set(current)
            if (next.has(groupId)) next.delete(groupId)
            else next.add(groupId)
            return next
        })
    }

    function beginCreateGroup() {
        setGroupName('새 그룹')
        setGroupDialog('new')
    }

    function beginRenameGroup(group: CharacterGroup) {
        setGroupName(group.name)
        setGroupDialog(group)
    }

    async function submitGroup(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const name = groupName.trim()
        if (!groupDialog || !name) return
        if (groupDialog === 'new') await onCreateGroup(name)
        else if (name !== groupDialog.name) await onRenameGroup(groupDialog.id, name)
        setGroupDialog(null)
    }

    function handleDragStart(event: DragStartEvent) {
        setActiveType(nodeTypeFromId(String(event.active.id)))
    }

    function handleDragOver(event: DragOverEvent) {
        if (nodeTypeFromId(String(event.active.id)) !== 'item') return
        const target = event.over?.data.current?.dropTarget
        if (!isCollectionDropTarget(target) || target.type !== 'group') return
        setExpandedGroups((current) => {
            if (current.has(target.groupId)) return current
            const next = new Set(current)
            next.add(target.groupId)
            return next
        })
    }

    function handleDragEnd(event: DragEndEvent) {
        setActiveType(null)
        const { active, over } = event
        if (!over) return
        const target = over.data.current?.dropTarget
        if (!isCollectionDropTarget(target)) return
        const result = moveGroupedCollection(groups, customCharacters, String(active.id), target)
        void onOrganize(result.groups, result.items)
    }

    return (
        <>
            <nav
                id="character-rail"
                className={cn(
                    'relative z-40 flex min-h-0 flex-col items-center border-r border-sidebar-border bg-sidebar max-[820px]:fixed max-[820px]:inset-y-0 max-[820px]:left-0 max-[820px]:w-[4.125rem] max-[820px]:invisible max-[820px]:-translate-x-full max-[820px]:transition-[transform,visibility] max-[820px]:duration-200 max-[820px]:ease-out motion-reduce:transition-none',
                    mobileOpen && 'max-[820px]:visible max-[820px]:translate-x-0',
                )}
                aria-label="캐릭터"
            >
                <button
                    type="button"
                    onClick={onHome}
                    className="grid h-[4rem] w-full shrink-0 place-items-center border-b border-sidebar-border font-serif text-xl font-bold text-primary transition-colors hover:bg-accent max-[820px]:text-transparent"
                    aria-label="홈으로 이동"
                >
                    M
                </button>
                <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2.5 overflow-y-auto px-2 pb-1 pt-3">
                    {chatCharacter ? (
                        <Button
                            variant="ghost"
                            className={cn(
                                'relative grid size-12 shrink-0 place-items-center rounded-md border border-primary/20 bg-primary/[0.06] p-0 text-primary hover:border-primary/50 hover:bg-primary/10 hover:text-primary',
                                selectedId === GENERAL_CHAT_CHARACTER_ID &&
                                    'border-selection-border bg-selection-strong text-foreground ring-1 ring-selection-border hover:bg-selection-strong hover:text-foreground',
                            )}
                            onClick={() => onSelect(GENERAL_CHAT_CHARACTER_ID)}
                            aria-label="General Chat 열기"
                            aria-current={
                                selectedId === GENERAL_CHAT_CHARACTER_ID ? 'page' : undefined
                            }
                            title="Chat · General assistant"
                        >
                            <ChatsCircle className="size-6" aria-hidden="true" weight="duotone" />
                        </Button>
                    ) : null}
                    {chatCharacter && (customCharacters.length || groups.length) ? (
                        <div className="h-px w-7 shrink-0 bg-sidebar-border" aria-hidden="true" />
                    ) : null}
                    <DndContext
                        sensors={sensors}
                        collisionDetection={groupCollisionDetection}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragCancel={() => setActiveType(null)}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="flex w-full flex-col items-center">
                            {rootNodes.map((node, index) => (
                                <Fragment key={`${node.type}:${node.id}`}>
                                    <CollectionDropSlot
                                        groupId={null}
                                        index={index}
                                        activeType={activeType}
                                    />
                                    {(() => {
                                        if (node.type === 'item') {
                                            const character = customCharacters.find(
                                                (item) => item.id === node.id,
                                            )
                                            return character ? (
                                                <CharacterTile
                                                    character={character}
                                                    selected={selectedId === character.id}
                                                    busy={busyCharacterIds.has(character.id)}
                                                    onSelect={onSelect}
                                                    onEdit={onEdit}
                                                    onDelete={onDelete}
                                                />
                                            ) : null
                                        }
                                        const group = groups.find((item) => item.id === node.id)
                                        if (!group) return null
                                        const children = groupedChildren(customCharacters, group.id)
                                        return (
                                            <CharacterFolder
                                                group={group}
                                                characters={children}
                                                expanded={expandedGroups.has(group.id)}
                                                activeType={activeType}
                                                selectedId={selectedId}
                                                busyCharacterIds={busyCharacterIds}
                                                onToggle={() => toggleGroup(group.id)}
                                                onRename={() => beginRenameGroup(group)}
                                                onDeleteGroup={() => void onDeleteGroup(group.id)}
                                                onSelect={onSelect}
                                                onEdit={onEdit}
                                                onDelete={onDelete}
                                            />
                                        )
                                    })()}
                                </Fragment>
                            ))}
                            <CollectionDropSlot
                                groupId={null}
                                index={rootNodes.length}
                                activeType={activeType}
                            />
                        </div>
                    </DndContext>
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    className="grid size-12 shrink-0 place-items-center rounded-full border border-border p-0 text-primary hover:border-primary hover:bg-primary/10 data-popup-open:border-primary data-popup-open:bg-primary/10"
                                    aria-label="캐릭터 또는 그룹 추가"
                                />
                            }
                        >
                            <Plus aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="end" className="w-52">
                            <DropdownMenuGroup>
                                <DropdownMenuLabel>캐릭터 추가</DropdownMenuLabel>
                                <DropdownMenuItem onClick={onImport}>
                                    <UploadSimple aria-hidden="true" /> 캐릭터 임포트
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={creating} onClick={onCreate}>
                                    {creating ? (
                                        <CircleNotch className="animate-spin" aria-hidden="true" />
                                    ) : (
                                        <UserPlus aria-hidden="true" />
                                    )}
                                    {creating ? '생성 중…' : '새 캐릭터 생성'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={beginCreateGroup}>
                                    <FolderPlus aria-hidden="true" /> 새 캐릭터 그룹
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <ThemeToggle className="mt-2 size-12 shrink-0" />
                <Button
                    variant="ghost"
                    className="grid size-12 shrink-0 place-items-center p-0 text-muted-foreground hover:bg-accent hover:text-foreground mb-3"
                    onClick={onSettings}
                    aria-label="서버 설정"
                >
                    <GearSix aria-hidden="true" />
                </Button>
            </nav>

            <Dialog
                open={Boolean(groupDialog)}
                onOpenChange={(open) => !open && setGroupDialog(null)}
            >
                <DialogContent>
                    <form className="grid gap-5" onSubmit={submitGroup}>
                        <DialogHeader>
                            <DialogTitle>
                                {groupDialog === 'new' ? '캐릭터 그룹 만들기' : '그룹 이름 변경'}
                            </DialogTitle>
                            <DialogDescription>
                                캐릭터를 폴더 위로 드래그해 그룹에 넣을 수 있습니다.
                            </DialogDescription>
                        </DialogHeader>
                        <Label className="grid gap-1.5 text-xs text-muted-foreground">
                            <span>그룹 이름</span>
                            <Input
                                value={groupName}
                                maxLength={100}
                                onChange={(event) => setGroupName(event.target.value)}
                            />
                        </Label>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setGroupDialog(null)}
                            >
                                취소
                            </Button>
                            <Button type="submit" disabled={!groupName.trim()}>
                                저장
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}

function CharacterFolder({
    group,
    characters,
    expanded,
    activeType,
    selectedId,
    busyCharacterIds,
    onToggle,
    onRename,
    onDeleteGroup,
    onSelect,
    onEdit,
    onDelete,
}: {
    group: CharacterGroup
    characters: Character[]
    expanded: boolean
    activeType: CollectionNodeType | null
    selectedId: string | null
    busyCharacterIds: Set<string>
    onToggle: () => void
    onRename: () => void
    onDeleteGroup: () => void
    onSelect: (id: string) => void
    onEdit: (id: string) => void
    onDelete: (character: Character) => void
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: groupNodeId(group.id),
    })
    const { setNodeRef: setDropTargetRef, isOver } = useDroppable({
        id: groupTargetId(group.id),
        data: { dropTarget: { type: 'group', groupId: group.id } },
    })
    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Translate.toString(transform) }}
            className={cn('flex w-full flex-col items-center', isDragging && 'opacity-45')}
        >
            <ContextMenu>
                <ContextMenuTrigger>
                    <Button
                        ref={setDropTargetRef}
                        variant="ghost"
                        className={cn(
                            'relative grid size-12 touch-none place-items-center rounded-md border border-border bg-background/40 p-0 text-muted-foreground transition-[color,background-color,border-color,box-shadow] hover:border-primary/45 hover:bg-accent hover:text-foreground motion-reduce:transition-none',
                            isOver &&
                                activeType === 'item' &&
                                'border-accent bg-accent/20 text-accent ring-2 ring-accent/40 hover:border-accent hover:bg-accent/20',
                        )}
                        onClick={onToggle}
                        aria-label={`${group.name} 그룹 ${expanded ? '접기' : '펼치기'}`}
                        aria-expanded={expanded}
                        title={`${group.name} · ${characters.length}명 · 드래그하여 정렬`}
                        {...attributes}
                        {...listeners}
                    >
                        {expanded ? <FolderOpen weight="duotone" /> : <Folder weight="duotone" />}
                        <span className="absolute -bottom-1 -right-1 grid min-w-4 place-items-center rounded-full border border-sidebar-border bg-sidebar px-1 font-mono text-[8px] text-sidebar-foreground">
                            {characters.length}
                        </span>
                    </Button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuLabel className="max-w-48 truncate">{group.name}</ContextMenuLabel>
                    <ContextMenuItem onClick={onRename}>
                        <PencilSimple aria-hidden="true" /> 이름 변경
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={onDeleteGroup}>
                        <Trash aria-hidden="true" /> 그룹 삭제 · 캐릭터 유지
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
            {expanded ? (
                <div className="relative flex w-full flex-col items-end before:absolute before:bottom-1 before:left-1 before:top-0 before:w-px before:bg-sidebar-border">
                    {characters.map((character, index) => (
                        <Fragment key={character.id}>
                            <CollectionDropSlot
                                groupId={group.id}
                                index={index}
                                activeType={activeType}
                                nested
                            />
                            <CharacterTile
                                character={character}
                                selected={selectedId === character.id}
                                busy={busyCharacterIds.has(character.id)}
                                nested
                                onSelect={onSelect}
                                onEdit={onEdit}
                                onDelete={onDelete}
                            />
                        </Fragment>
                    ))}
                    <CollectionDropSlot
                        groupId={group.id}
                        index={characters.length}
                        activeType={activeType}
                        nested
                    />
                </div>
            ) : null}
        </div>
    )
}

function CharacterTile({
    character,
    selected,
    busy,
    nested,
    onSelect,
    onEdit,
    onDelete,
}: {
    character: Character
    selected: boolean
    busy: boolean
    nested?: boolean
    onSelect: (id: string) => void
    onEdit: (id: string) => void
    onDelete: (character: Character) => void
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: itemNodeId(character.id),
    })
    return (
        <ContextMenu>
            <ContextMenuTrigger
                ref={setNodeRef}
                style={{ transform: CSS.Translate.toString(transform) }}
                className={cn(
                    'shrink-0 rounded-md',
                    nested && 'mr-0.5',
                    isDragging && 'opacity-45',
                )}
            >
                <Button
                    variant="ghost"
                    className={cn(
                        'relative grid size-12 min-h-12 min-w-12 touch-none place-items-center overflow-hidden p-0 hover:bg-accent',
                        nested && 'size-10 min-h-10 min-w-10',
                        selected &&
                            'border-selection-border bg-selection-strong text-foreground ring-1 ring-selection-border hover:bg-selection-strong hover:text-foreground',
                    )}
                    onClick={() => onSelect(character.id)}
                    aria-label={`${character.name} 대화 보기`}
                    aria-current={selected ? 'page' : undefined}
                    title={`${character.name} · 드래그하여 이동 · 우클릭하여 관리`}
                    {...attributes}
                    {...listeners}
                >
                    <CharacterAvatar
                        character={character}
                        className="absolute inset-0 size-full min-h-full min-w-full"
                    />
                </Button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuLabel className="max-w-48 truncate">{character.name}</ContextMenuLabel>
                <ContextMenuItem onClick={() => onSelect(character.id)}>
                    <ChatCircle aria-hidden="true" /> 대화 열기
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onEdit(character.id)}>
                    <PencilSimple aria-hidden="true" /> 캐릭터 편집
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    variant="destructive"
                    disabled={busy}
                    onClick={() => onDelete(character)}
                >
                    <Trash aria-hidden="true" /> 캐릭터 삭제
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}

function CollectionDropSlot({
    groupId,
    index,
    activeType,
    nested,
}: {
    groupId: string | null
    index: number
    activeType: CollectionNodeType | null
    nested?: boolean
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: dropSlotId(groupId, index),
        data: { dropTarget: { type: 'slot', groupId, index } },
        disabled: activeType === 'group' && groupId !== null,
    })
    return (
        <div
            ref={setNodeRef}
            className={cn(
                'relative h-2.5 w-full shrink-0',
                nested && 'w-10',
                activeType &&
                    'after:absolute after:inset-x-1 after:top-1/2 after:h-0.5 after:-translate-y-1/2 after:rounded-full after:bg-accent/0 after:transition-colors motion-reduce:after:transition-none',
                isOver &&
                    'after:bg-accent after:shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_18%,transparent)]',
            )}
            aria-hidden="true"
        />
    )
}
