local lockKey = KEYS[1]
if(redis.call("get", lockKey) == "1")
then
    return 1
else
    redis.call("set", lockKey, 1)
    return 0
end