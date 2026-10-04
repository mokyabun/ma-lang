function initialize(id)
    local count = tonumber(getChatVar(id, 'initializations')) or 0
    setChatVar(id, 'initializations', tostring(count + 1))
    setChatVar(id, 'initialized', '1')
    setChatVar(id, 'choice', '0')
    setChatVar(id, 'hp', '1000')
    setChatVar(id, 'fallback', getChatVar(id, 'fallback_value'))
end

function toggleChoice(id)
    local choice = getChatVar(id, 'choice')
    setChatVar(id, 'choice', choice == '0' and '1' or '0')
end

function onButtonClick(id, data)
    local message = string.match(data, '^choice%^(.*)$')
    if message then addChat(id, 'user', message) end
end

setHP = async(function(id)
    local value = alertInput(id, 'HP'):await()
    setChatVar(id, 'hp', value)
    alertNormal(id, 'HP saved')
end)

listenEdit('editDisplay', function(id, value)
    return value .. '\nSTATUS'
end)
