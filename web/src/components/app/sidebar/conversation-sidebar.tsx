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
import {
    GENERAL_CHAT_CHARACTER_ID,
    type Character,
    type Conversation,
    type ConversationGroup,
} from '@malang/shared'
import {
    CaretRight,
    ChatCircle,
    ChatsCircle,
    CircleNotch,
    DotsThree,
    Folder,
    FolderOpen,
    FolderPlus,
    PencilSimple,
    SlidersHorizontal,
    Trash,
    UserCircle,
} from '@phosphor-icons/react'
import { Fragment, type FormEvent, useState } from 'react'

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
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import { AppSearchInput } from '../app-search-input'
import { CharacterAvatar } from '../character/character-avatar'
import { relativeTime } from '../chat/format'
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

export function ConversationSidebar({
    character,
    conversations,
    groups,
    selectedId,
    search,
    generatingIds,
    creating,
    mobileOpen,
    workspace,
    onSearch,
    onSelect,
    onCreate,
    onRename,
    onArchive,
    onCreateGroup,
    onRenameGroup,
    onDeleteGroup,
    onOrganize,
    onClose,
    onEditCharacter,
    onOpenSettings,
}: {
    character: Character | null
    conversations: Conversation[]
    groups: ConversationGroup[]
    selectedId: string | null
    search: string
    generatingIds: Set<string>
    creating: boolean
    mobileOpen: boolean
    workspace: 'chat' | 'character'
    onSearch: (value: string) => void
    onSelect: (id: string) => void
    onCreate: () => void
    onRename: (id: string, title: string) => void | Promise<void>
    onArchive: (id: string) => void
    onCreateGroup: (name: string) => void | Promise<void>
    onRenameGroup: (id: string, name: string) => void | Promise<void>
    onDeleteGroup: (id: string) => void | Promise<void>
    onOrganize: (groups: ConversationGroup[], conversations: Conversation[]) => void | Promise<void>
    onClose: () => void
    onEditCharacter: () => void
    onOpenSettings: () => void
}) {
    const isGeneralChat = character?.id === GENERAL_CHAT_CHARACTER_ID
    const [renaming, setRenaming] = useState<Conversation | null>(null)
    const [renameDraft, setRenameDraft] = useState('')
    const [groupDialog, setGroupDialog] = useState<ConversationGroup | 'new' | null>(null)
    const [groupName, setGroupName] = useState('')
    const [activeType, setActiveType] = useState<CollectionNodeType | null>(null)
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
        () => new Set(groups.map((group) => group.id)),
    )
    const searching = Boolean(search.trim())
    const visibleGroups = searching
        ? groups.filter((group) =>
              conversations.some((conversation) => conversation.groupId === group.id),
          )
        : groups
    const rootNodes = rootCollectionNodes(visibleGroups, conversations)
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor),
    )

    function beginRename(conversation: Conversation) {
        setRenaming(conversation)
        setRenameDraft(conversation.title)
    }

    async function submitRename(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const title = renameDraft.trim()
        if (!renaming || !title) return
        if (title !== renaming.title) await onRename(renaming.id, title)
        setRenaming(null)
    }

    function beginGroup(group: ConversationGroup | 'new') {
        setGroupName(group === 'new' ? '새 그룹' : group.name)
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

    function toggleGroup(groupId: string) {
        setExpandedGroups((current) => {
            const next = new Set(current)
            if (next.has(groupId)) next.delete(groupId)
            else next.add(groupId)
            return next
        })
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
        if (searching || !event.over) return
        const target = event.over.data.current?.dropTarget
        if (!isCollectionDropTarget(target)) return
        const result = moveGroupedCollection(groups, conversations, String(event.active.id), target)
        void onOrganize(result.groups, result.items)
    }

    return (
        <>
            <div
                className={cn(
                    'pointer-events-none fixed inset-0 z-20 bg-background/70 opacity-0 transition-opacity motion-reduce:transition-none min-[821px]:hidden',
                    mobileOpen && 'pointer-events-auto opacity-100',
                )}
                onClick={onClose}
                role="presentation"
            />
            <aside
                id="conversation-sidebar"
                className={cn(
                    'relative z-30 flex min-h-0 min-w-0 flex-col border-r border-sidebar-border bg-sidebar max-[820px]:fixed max-[820px]:inset-y-0 max-[820px]:left-[4.125rem] max-[820px]:w-[min(22rem,calc(100vw-5.5rem))] max-[820px]:invisible max-[820px]:-translate-x-[calc(100%+4.125rem)] max-[820px]:shadow-2xl max-[820px]:transition-[transform,visibility] max-[820px]:duration-200 max-[820px]:ease-out motion-reduce:transition-none',
                    mobileOpen && 'max-[820px]:visible max-[820px]:translate-x-0',
                )}
                aria-label="선택한 캐릭터 작업"
            >
                <header className="flex h-[4rem] shrink-0 items-center gap-3 border-b border-sidebar-border px-3 [&_.avatar]:size-9 [&_.avatar]:shrink-0">
                    {character ? <CharacterAvatar character={character} /> : null}
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate font-serif text-base font-medium">
                            {character?.name ?? '캐릭터를 선택하세요'}
                        </h2>
                    </div>
                </header>

                <AppSearchInput
                    label="채팅 검색"
                    className="mx-3 my-3"
                    value={search}
                    onChange={(event) => onSearch(event.target.value)}
                    placeholder="채팅 검색"
                />

                <nav
                    className="grid shrink-0 gap-1.5 border-b border-sidebar-border px-3 pb-3"
                    aria-label="캐릭터 작업"
                >
                    <Button
                        variant="ghost"
                        className="justify-start text-muted-foreground"
                        onClick={onOpenSettings}
                        disabled={!character || !selectedId}
                    >
                        <SlidersHorizontal aria-hidden="true" /> 채팅 설정
                    </Button>
                    {!isGeneralChat ? (
                        <Button
                            variant="ghost"
                            className={cn(
                                'justify-start text-muted-foreground',
                                workspace === 'character' &&
                                    'border-selection-border bg-selection-strong text-foreground',
                            )}
                            onClick={onEditCharacter}
                            disabled={!character}
                            aria-current={workspace === 'character' ? 'page' : undefined}
                        >
                            <UserCircle aria-hidden="true" /> 캐릭터 편집
                        </Button>
                    ) : null}
                    <Button
                        variant="ghost"
                        className="justify-start border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 [&>kbd]:ml-auto"
                        onClick={onCreate}
                        disabled={!character || creating}
                    >
                        {creating ? (
                            <CircleNotch aria-hidden="true" className="animate-spin" />
                        ) : (
                            <ChatCircle aria-hidden="true" weight="fill" />
                        )}
                        {creating ? '대화 여는 중…' : '새 채팅'}
                        {!creating ? (
                            <kbd className="font-mono text-[9px] font-normal opacity-60">⌘ N</kbd>
                        ) : null}
                    </Button>
                </nav>

                <div className="flex items-center justify-between px-4 pb-2 pt-3">
                    <div className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        <span>채팅</span>
                        <span>{conversations.length}</span>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => beginGroup('new')}
                        disabled={!character}
                        aria-label="새 채팅 그룹"
                        title="새 채팅 그룹"
                    >
                        <FolderPlus aria-hidden="true" />
                    </Button>
                </div>
                <div className="min-h-24 flex-1 overflow-y-auto px-2 pb-3">
                    {searching ? (
                        <p className="px-2 pb-2 text-[10px] text-muted-foreground">
                            검색 중에는 드래그 정렬이 잠시 꺼집니다.
                        </p>
                    ) : null}
                    {rootNodes.length ? (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={groupCollisionDetection}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDragCancel={() => setActiveType(null)}
                            onDragEnd={handleDragEnd}
                        >
                            {rootNodes.map((node, index) => (
                                <Fragment key={`${node.type}:${node.id}`}>
                                    <ConversationDropSlot
                                        groupId={null}
                                        index={index}
                                        activeType={activeType}
                                    />
                                    {(() => {
                                        if (node.type === 'item') {
                                            const conversation = conversations.find(
                                                (item) => item.id === node.id,
                                            )
                                            return conversation ? (
                                                <ConversationRow
                                                    conversation={conversation}
                                                    selected={
                                                        workspace === 'chat' &&
                                                        selectedId === conversation.id
                                                    }
                                                    generating={generatingIds.has(conversation.id)}
                                                    dragDisabled={searching}
                                                    onSelect={onSelect}
                                                    onRename={beginRename}
                                                    onArchive={onArchive}
                                                />
                                            ) : null
                                        }
                                        const group = visibleGroups.find(
                                            (item) => item.id === node.id,
                                        )
                                        if (!group) return null
                                        return (
                                            <ConversationFolder
                                                group={group}
                                                conversations={groupedChildren(
                                                    conversations,
                                                    group.id,
                                                )}
                                                expanded={expandedGroups.has(group.id)}
                                                activeType={activeType}
                                                selectedId={
                                                    workspace === 'chat' ? selectedId : null
                                                }
                                                generatingIds={generatingIds}
                                                dragDisabled={searching}
                                                onToggle={() => toggleGroup(group.id)}
                                                onSelect={onSelect}
                                                onRename={beginRename}
                                                onArchive={onArchive}
                                                onRenameGroup={() => beginGroup(group)}
                                                onDeleteGroup={() => void onDeleteGroup(group.id)}
                                            />
                                        )
                                    })()}
                                </Fragment>
                            ))}
                            {!searching ? (
                                <ConversationDropSlot
                                    groupId={null}
                                    index={rootNodes.length}
                                    activeType={activeType}
                                />
                            ) : null}
                        </DndContext>
                    ) : (
                        <div className="grid place-items-center gap-2 px-5 py-10 text-center text-muted-foreground">
                            <ChatCircle aria-hidden="true" />
                            <p>
                                {character
                                    ? searching
                                        ? '검색 결과가 없습니다.'
                                        : '아직 채팅이 없습니다.'
                                    : '캐릭터를 먼저 선택하세요.'}
                            </p>
                        </div>
                    )}
                </div>
            </aside>

            <Dialog open={Boolean(renaming)} onOpenChange={(open) => !open && setRenaming(null)}>
                <DialogContent>
                    <form className="grid gap-5" onSubmit={submitRename}>
                        <DialogHeader>
                            <DialogTitle>채팅 이름 변경</DialogTitle>
                            <DialogDescription>
                                Chat History에 표시할 이름을 입력하세요.
                            </DialogDescription>
                        </DialogHeader>
                        <Label className="grid gap-1.5 text-xs text-muted-foreground">
                            <span>채팅 이름</span>
                            <Input
                                value={renameDraft}
                                maxLength={200}
                                onChange={(event) => setRenameDraft(event.target.value)}
                            />
                        </Label>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setRenaming(null)}
                            >
                                취소
                            </Button>
                            <Button type="submit" disabled={!renameDraft.trim()}>
                                저장
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog
                open={Boolean(groupDialog)}
                onOpenChange={(open) => !open && setGroupDialog(null)}
            >
                <DialogContent>
                    <form className="grid gap-5" onSubmit={submitGroup}>
                        <DialogHeader>
                            <DialogTitle>
                                {groupDialog === 'new' ? '채팅 그룹 만들기' : '그룹 이름 변경'}
                            </DialogTitle>
                            <DialogDescription>
                                채팅을 폴더로 드래그해 분류할 수 있습니다.
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

function ConversationFolder({
    group,
    conversations,
    expanded,
    activeType,
    selectedId,
    generatingIds,
    dragDisabled,
    onToggle,
    onSelect,
    onRename,
    onArchive,
    onRenameGroup,
    onDeleteGroup,
}: {
    group: ConversationGroup
    conversations: Conversation[]
    expanded: boolean
    activeType: CollectionNodeType | null
    selectedId: string | null
    generatingIds: Set<string>
    dragDisabled: boolean
    onToggle: () => void
    onSelect: (id: string) => void
    onRename: (conversation: Conversation) => void
    onArchive: (id: string) => void
    onRenameGroup: () => void
    onDeleteGroup: () => void
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: groupNodeId(group.id),
        disabled: dragDisabled,
    })
    const { setNodeRef: setDropTargetRef, isOver } = useDroppable({
        id: groupTargetId(group.id),
        data: { dropTarget: { type: 'group', groupId: group.id } },
        disabled: dragDisabled,
    })
    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Translate.toString(transform) }}
            className={cn(isDragging && 'opacity-45')}
        >
            <ContextMenu>
                <ContextMenuTrigger
                    ref={setDropTargetRef}
                    className={cn(
                        'group flex min-h-10 items-center gap-1 rounded-md border border-transparent px-1.5 text-muted-foreground transition-[color,background-color,border-color,box-shadow] hover:bg-selection hover:text-foreground motion-reduce:transition-none',
                        !dragDisabled && 'touch-none cursor-grab active:cursor-grabbing',
                        isOver &&
                            activeType === 'item' &&
                            'border-accent bg-accent/15 text-foreground ring-1 ring-accent/45 hover:bg-accent/15',
                    )}
                    {...attributes}
                    {...listeners}
                >
                    <button
                        type="button"
                        onClick={onToggle}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        aria-expanded={expanded}
                    >
                        <CaretRight
                            className={cn(
                                'shrink-0 transition-transform motion-reduce:transition-none',
                                expanded && 'rotate-90',
                            )}
                            aria-hidden="true"
                        />
                        {expanded ? (
                            <FolderOpen
                                className="shrink-0 text-primary"
                                weight="duotone"
                                aria-hidden="true"
                            />
                        ) : (
                            <Folder
                                className="shrink-0 text-primary"
                                weight="duotone"
                                aria-hidden="true"
                            />
                        )}
                        <strong className="truncate text-xs font-medium">{group.name}</strong>
                        <small className="ml-auto font-mono text-[9px]">
                            {conversations.length}
                        </small>
                    </button>
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 data-popup-open:opacity-100"
                                    aria-label={`${group.name} 관리`}
                                />
                            }
                        >
                            <DotsThree aria-hidden="true" weight="bold" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={onRenameGroup}>
                                <PencilSimple aria-hidden="true" /> 이름 변경
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={onDeleteGroup}>
                                <Trash aria-hidden="true" /> 그룹 삭제 · 채팅 유지
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuLabel className="max-w-52 truncate">{group.name}</ContextMenuLabel>
                    <ContextMenuItem onClick={onRenameGroup}>
                        <PencilSimple aria-hidden="true" /> 이름 변경
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={onDeleteGroup}>
                        <Trash aria-hidden="true" /> 그룹 삭제 · 채팅 유지
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
            {expanded ? (
                <div className="ml-4 border-l border-sidebar-border pl-1.5">
                    {conversations.map((conversation, index) => (
                        <Fragment key={conversation.id}>
                            <ConversationDropSlot
                                groupId={group.id}
                                index={index}
                                activeType={activeType}
                            />
                            <ConversationRow
                                conversation={conversation}
                                selected={selectedId === conversation.id}
                                generating={generatingIds.has(conversation.id)}
                                dragDisabled={dragDisabled}
                                onSelect={onSelect}
                                onRename={onRename}
                                onArchive={onArchive}
                            />
                        </Fragment>
                    ))}
                    {!dragDisabled ? (
                        <ConversationDropSlot
                            groupId={group.id}
                            index={conversations.length}
                            activeType={activeType}
                        />
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

function ConversationRow({
    conversation,
    selected,
    generating,
    dragDisabled,
    onSelect,
    onRename,
    onArchive,
}: {
    conversation: Conversation
    selected: boolean
    generating: boolean
    dragDisabled: boolean
    onSelect: (id: string) => void
    onRename: (conversation: Conversation) => void
    onArchive: (id: string) => void
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: itemNodeId(conversation.id),
        disabled: dragDisabled,
    })
    return (
        <ContextMenu>
            <ContextMenuTrigger
                ref={setNodeRef}
                style={{ transform: CSS.Translate.toString(transform) }}
                className={cn(
                    'group relative mb-1 flex min-h-14 w-full items-center rounded-md text-muted-foreground hover:bg-selection hover:text-foreground',
                    selected &&
                        'border-selection-border bg-selection-strong text-foreground hover:bg-selection-strong',
                    isDragging && 'opacity-45',
                    !dragDisabled && 'touch-none cursor-grab active:cursor-grabbing',
                )}
                {...attributes}
                {...listeners}
            >
                <Button
                    variant="ghost"
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-2.5 bg-transparent px-1.5 text-left text-inherit hover:bg-transparent"
                    onClick={() => onSelect(conversation.id)}
                >
                    <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background">
                        {generating ? (
                            <span className="size-2 animate-pulse rounded-full bg-primary" />
                        ) : (
                            <ChatsCircle aria-hidden="true" />
                        )}
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5 text-left [&_small]:text-[10px] [&_small]:text-muted-foreground [&_strong]:truncate [&_strong]:text-xs">
                        <strong>{conversation.title}</strong>
                        <small>{relativeTime(conversation.updatedAt)}</small>
                    </span>
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="mr-1 opacity-0 group-hover:opacity-100 focus:opacity-100 data-popup-open:opacity-100"
                                aria-label={`${conversation.title} 관리`}
                            />
                        }
                    >
                        <DotsThree aria-hidden="true" weight="bold" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <div className="max-w-52 truncate px-2 py-2 text-xs text-muted-foreground">
                            {conversation.title}
                        </div>
                        <DropdownMenuItem onClick={() => onSelect(conversation.id)}>
                            <ChatCircle aria-hidden="true" /> 채팅 열기
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onRename(conversation)}>
                            <PencilSimple aria-hidden="true" /> 이름 변경
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            variant="destructive"
                            disabled={generating}
                            onClick={() => onArchive(conversation.id)}
                        >
                            <Trash aria-hidden="true" /> 채팅 삭제
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuLabel className="max-w-52 truncate">
                    {conversation.title}
                </ContextMenuLabel>
                <ContextMenuItem onClick={() => onSelect(conversation.id)}>
                    <ChatCircle aria-hidden="true" /> 채팅 열기
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onRename(conversation)}>
                    <PencilSimple aria-hidden="true" /> 이름 변경
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    variant="destructive"
                    disabled={generating}
                    onClick={() => onArchive(conversation.id)}
                >
                    <Trash aria-hidden="true" /> 채팅 삭제
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}

function ConversationDropSlot({
    groupId,
    index,
    activeType,
}: {
    groupId: string | null
    index: number
    activeType: CollectionNodeType | null
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
                'relative h-2 w-full',
                activeType &&
                    'after:absolute after:inset-x-1 after:top-1/2 after:h-0.5 after:-translate-y-1/2 after:rounded-full after:bg-accent/0 after:transition-colors motion-reduce:after:transition-none',
                isOver &&
                    'after:bg-accent after:shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_18%,transparent)]',
            )}
            aria-hidden="true"
        />
    )
}
