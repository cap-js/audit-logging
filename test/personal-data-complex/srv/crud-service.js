const cds = require('@sap/cds');

module.exports = async srv => {
    const {Collaborations, Participants} = srv.entities;
    srv.on('leave', Collaborations, async req => {
        await DELETE.from(Participants).where({
            student_userID: req.user.id,
        });
    });
}