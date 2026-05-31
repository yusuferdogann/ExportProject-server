const sendJwtToClient = (user, res) => {

    const token = user.genereteJwtFromUser();

    const { NODE_ENV, JWT_COOKIE } = process.env;
    return res.status(200)
        .cookie("access_token", token, {
            httpOnly: true,
            expires: new Date(Date.now() + parseInt(JWT_COOKIE) * 1000 * 60),
            secure: NODE_ENV === "development" ? false : true
        })
        .json({
            success: true,
            access_token: token,
            data: {
                username: user.username,
                email: user.email,
                detail: user
        //    data: {
        //             id: user._id,                 // 🔄 eklendi
        //             username: user.username,      // 🔄 kaldı (doğru)
        //             email: user.email,            // 🔄 kaldı (doğru)
        //             role: user.role,              // 🔄 eklendi
        //             companyId: user.companyId     // 🔄 eklendi (TENANT CONTEXT)
        //         }

            }
        })
}

const isTokenIncluded = (req) => {
    return req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
}

const getAccessTokenFromHeader = (req) => {
    const authorization = req.headers.authorization;
    access_token = authorization.split(" ")[1];
    // const access_token = authorization;

    return access_token;
}
module.exports = {
    sendJwtToClient,
    isTokenIncluded,
    getAccessTokenFromHeader
};