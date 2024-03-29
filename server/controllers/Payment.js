const {instance} = require("../config/razorpay");
const Course = require("../models/Course");
const User = require("../models/User");
const mailSender = require("../utils/mailSender");
const {courseEnrollmentEmail} = require("../mail/templates/courseEnrollmentEmail");
const { default: mongoose } = require("mongoose");



//capture the payment and initiate the Razorpay order
exports.capturePayment = async(req,res)=>{
    try{

        //get courseId and userId
        const {course_id} = req.body;
        const userId = req.user.id;

        //validation
        //valid courseId
        if(!course_id){
            return res.json({
                success:false,
                message:"Please provide a valid courseId",
            })
        }

        //valid courseDetails
        let course = await Course.findById(course_id);
        try{
        if(!course){
            return res.json({
                success:false,
                message:"Couldnot find the course",
            })
        }

        //user already pay for the same course
        const uid = new mongoose.Types.ObjectId(userId);
        if(course.studentEnrolled.includes(uid)){
            return res.status(200).json({
                success:false,
                message:"Student enrolled already",
            })
        }
    }
    catch(error){
        console.log(error);
        return res.status(500).json({
            success:false,
            message:error.message,
        })
    }

        //order create
        const amount = course.price;
        const currency = "INR";

        const options = {
            amount:amount*100,
            currency,
            receipt:Math.random(Date.now()).toString(),
            notes:{
                courseId: course_id,
                userId,
            }
        };

        try{
            //initiate the payment using razorpay
            const paymentResponse = await instance.orders.create(options);
            console.log(paymentResponse);

            //return response
            return res.status(200).json({
                success:true,
                courseName:course.courseName,
                courseDescription:course.courseDescription,
                thumbnail:course.thumbnail,
                orderId: paymentResponse.id,
                currency:paymentResponse.currency,
                amount:paymentResponse.amount,
            })
        }
        catch(error){
            console.log(error);
            res.json({
                success:false,
                messgae:"Could not initiate the order"
            });
        }
    }
    catch(error){

    }
};

//verify signature of Razorpay and Server
exports.verifySignature = async(req,res)=>{
    const webhookSecret = "12345678";

    const signature =req.headers("x-razorpay-signature");

    const shasum = crypto.createHmac(
        "sha256", webhookSecret
    );
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest("hex");

    if(signature === digest){
        console.log("Payment is Authorized");

        //get courseId and userid from notes ... we have passed in notes earlier
        const {courseId, userId} = req.body.payload.payment.entity.notes;

        try{
              
            //fullfill the action
            //find the course and enroll the student in it
            const enrolledCourse = await Course.findOneAndUpdate(
                {_id:courseId},
                {
                    $push:{
                        studentsEnrolled: userId,
                    },
                },
                {new:true},
            );

            if(!enrolledCourse){
                return res.status(500).json({
                    success:false,
                    message:"Course not found",
                });
            }
            console.log(enrolledCourse);

            //find the student and add the course in the list of enrolled courses
            const enrolledStudent = await User.findOneAndUpdate(
                    {_id:userId},
                        {$push:
                            {course:courseId},
                        },
                        {new:true},
            );
            console.log(enrolledStudent);

            //mail send karo confirmation waala
            const emailResponse = await mailSender(
                enrolledStudent.email,
                "Congratulations from codhelp",
                "Congratulation you are onboarded into new Codehelp course"
            );

            console.log(emailResponse);
            return res.status(200).json({
                success:true,
                message:"Signature Verified and Course Added",
            });
         }
        catch(error){
            console.log(error);
            return res.status(500).json({
                success:false,
                message:error.message,
            });
        }
      
    }
    else{
        return res.status(400).json({
            success:false,
            message:"Invalid request",
        })
    }
};